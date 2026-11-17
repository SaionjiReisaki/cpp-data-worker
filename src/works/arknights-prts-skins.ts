import { DateTime } from 'luxon'
import { z } from 'zod'
import { buildData, readData } from '../dc-utils.js'
import { unwrapZod } from '../zutils.js'
import type { ArknightsKengxxiao } from './arknights-kengxxiao.js'

// The game data only knows the skin store's own tabs. PRTS editors copy every sale window from the announcements
// (which are images) into the 时装回廊 pages, including the 罗德岛风尚回顾 sales and the channels outside the store.
const api =
  'https://prts.wiki/api.php?' +
  new URLSearchParams({
    action: 'query',
    generator: 'allpages',
    gapprefix: '时装回廊/',
    gaplimit: '100',
    prop: 'revisions',
    rvprop: 'ids|timestamp|content',
    rvslots: 'main',
    format: 'json',
    formatversion: '2',
  }).toString()

const userAgent = 'cpp-data-worker (+https://github.com/SaionjiReisaki/cpp-data-worker)'

type Kengxxiao = z.output<typeof ArknightsKengxxiao>

export async function makeArknightsPrtsSkins() {
  const file = 'arknights-prts-skins'

  await buildData(
    file,
    async () => {
      const pages = await fetchPages()
      const excel = await readData<Kengxxiao>('arknights-kengxxiao-zh_CN')
      const latest = pages.reduce((a, b) => (b.revid > a.revid ? b : a))
      // Names are matched to ids through the game data, so a game update has to rebuild this too.
      const version = {
        id: `${latest.revid}:${excel.version.id}`,
        text: latest.timestamp,
        timestamp: Date.parse(latest.timestamp),
        sources: ['https://prts.wiki/w/时装回廊'],
        schema: 1,
      }
      return [version, pages, excel.data] as const
    },
    (pages, excel) => {
      const ids = new Map<string, string | null>()
      for (const skin of Object.values(excel.exSkin.charSkins)) {
        const name = skin.displaySkin.skinName
        if (name == null) continue
        ids.set(name, ids.has(name) ? null : skin.skinId)
      }

      const skins: z.input<typeof Shape>['skins'] = {}
      const skipped: { name: string; field: string; text: string }[] = []
      const unmatched: string[] = []
      for (const page of pages) {
        for (const block of splitSkinTemplates(page.content)) {
          const skin = parseSkin(readFields(cleanText(block)))
          for (const s of skin.skipped) skipped.push({ name: skin.name, ...s })
          const id = ids.get(skin.name)
          if (id == null || skins[id]) {
            const why = id === undefined ? '' : id === null ? ' (name is not unique)' : ' (listed twice)'
            unmatched.push(`${page.title}: ${skin.name}${why}`)
            continue
          }
          skins[id] = { windows: skin.windows, noVoucher: skin.noVoucher, dynamic: skin.dynamic }
        }
      }

      console.log(`matched ${Object.keys(skins).length} skins`)
      console.log(`skipped ${skipped.length} sale segments:`)
      for (const s of skipped) console.log(`  ${s.name} | ${s.field} | ${s.text}`)
      console.log(`unmatched ${unmatched.length} skins:`)
      for (const s of unmatched) console.log(`  ${s}`)

      return [unwrapZod(Shape.safeParse({ skins })), Shape]
    },
  )
}

async function fetchPages() {
  const pages = new Map<number, { title: string; revid: number; timestamp: string; content: string }>()
  let next: Record<string, string> | undefined = {}
  while (next) {
    const url: string = api + (Object.keys(next).length ? '&' + new URLSearchParams(next).toString() : '')
    const res = await fetch(url, { headers: { 'User-Agent': userAgent } })
    if (!res.ok) throw new Error(`Failed to fetch ${url}: Error ${res.status}: ${res.statusText}`)
    const body = unwrapZod(ApiResponse.safeParse(await res.json()))
    for (const page of body.query?.pages ?? []) {
      // A continued response repeats pages whose revisions came in an earlier batch, without them.
      const rev = page.revisions?.[0]
      if (rev) {
        const { revid, timestamp } = rev
        pages.set(page.pageid, { title: page.title, revid, timestamp, content: rev.slots.main.content })
      }
    }
    next = body.continue
  }
  if (!pages.size) throw new Error('No 时装回廊 pages from PRTS')
  return [...pages.values()]
}

export function splitSkinTemplates(wikitext: string) {
  return wikitext
    .split('{{干员时装')
    .slice(1)
    .map((chunk) => {
      const end = chunk.search(/^\}\}/m)
      return end < 0 ? chunk : chunk.slice(0, end)
    })
}

// Footnotes (<ref>) are dropped too: they carry their own dates and remarks about a sale, not the sale.
export function cleanText(text: string) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]/g, '$1')
}

/** A value runs until the next line that starts with |. */
export function readFields(block: string) {
  const fields = new Map<string, string>()
  let key: string | undefined
  let value: string[] = []
  const flush = () => {
    if (key !== undefined) fields.set(key, value.join('\n').trim())
  }
  for (const line of block.split('\n')) {
    if (!line.startsWith('|')) {
      value.push(line)
      continue
    }
    flush()
    const eq = line.indexOf('=')
    key = eq < 0 ? undefined : line.slice(1, eq).trim()
    value = eq < 0 ? [] : [line.slice(eq + 1)]
  }
  flush()
  return fields
}

export function splitSegments(value: string) {
  return value
    .split(/<hr\s*\/?>/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

const timePattern = /(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/g

/**
 * Unix seconds, Beijing time. A window with only a start is open-ended when the text says so (「…以后」); one that is
 * just 「常驻」 has been on sale since the store opened (十字郡).
 */
export function readTimes(segment: string): { start: number; end: number | null } | null {
  const times = [...segment.matchAll(timePattern)].map((m) =>
    DateTime.fromObject(
      { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] },
      { zone: 'Asia/Shanghai' },
    ),
  )
  if (times.some((t) => !t.isValid)) return null
  if (times.length >= 2) return { start: times[0].toUnixInteger(), end: times[1].toUnixInteger() }
  if (times.length === 1 && segment.includes('以后')) return { start: times[0].toUnixInteger(), end: null }
  if (times.length === 0 && segment.startsWith('常驻')) return { start: 0, end: null }
  return null
}

export type Kind = 'first' | 'rerun' | 'retro'
export type Channel = z.output<typeof Channel>

export function channelOf(segment: string, kind: Kind, approach: string): Channel {
  if (segment.includes('凭证交易所')) return 'certificate'
  if (segment.includes('记录修复')) return 'record'
  if (segment.includes('危机合约') || segment.includes('圣所')) return 'contract'
  if (segment.includes('里程碑')) return 'milestone'
  if (segment.includes('任务奖励') || segment.includes('签到')) return 'mission'
  if (kind === 'retro') return 'retro'
  if (approach.includes('采购中心') && !segment.includes('活动')) return 'shop'
  return 'event'
}

/** A segment's own {{价格|unit|amount}} wins over the field's; the amount stays a string ("18→15"). */
export function readPrice(segment: string, price: string | undefined, unit: string | undefined) {
  const m = segment.match(/\{\{价格\|([^|}]*)\|([^|}]*)\}\}/)
  if (m) return { price: m[2].trim() || null, unit: m[1].trim() || null }
  return { price: price?.trim() || null, unit: unit?.trim() || null }
}

const saleFields: { pattern: RegExp; kind: Kind; price: (n: string) => [string, string] }[] = [
  { pattern: /^限时时间$/, kind: 'first', price: () => ['价格', '价格单位'] },
  { pattern: /^复刻时间(\d+)$/, kind: 'rerun', price: (n) => [`复刻价格${n}`, `复刻价格单位${n}`] },
  { pattern: /^回顾时间(\d+)$/, kind: 'retro', price: (n) => [`回顾价格${n}`, `回顾价格单位${n}`] },
]

export function parseSkin(fields: Map<string, string>) {
  const approach = fields.get('获得途径') ?? ''
  const windows: z.input<typeof Window>[] = []
  const skipped: { field: string; text: string }[] = []
  for (const [field, value] of fields) {
    for (const { pattern, kind, price } of saleFields) {
      const m = field.match(pattern)
      if (!m) continue
      const n = m[1] ?? '0'
      const [priceField, unitField] = price(n)
      for (const segment of splitSegments(value)) {
        const times = readTimes(segment)
        if (!times) {
          skipped.push({ field, text: segment })
          continue
        }
        windows.push({
          kind,
          n: +n,
          channel: channelOf(segment, kind, approach),
          ...times,
          ...readPrice(segment, fields.get(priceField), fields.get(unitField)),
        })
      }
    }
  }
  windows.sort((a, b) => a.start - b.start)
  return {
    name: fields.get('时装名') ?? '',
    windows,
    noVoucher: !!fields.get('不可兑换'),
    dynamic: !!fields.get('动态形象'),
    skipped,
  }
}

const ApiResponse = z.object({
  continue: z.record(z.string()).optional(),
  query: z
    .object({
      pages: z.array(
        z.object({
          pageid: z.number(),
          title: z.string(),
          revisions: z
            .array(
              z.object({
                revid: z.number(),
                timestamp: z.string(),
                slots: z.object({ main: z.object({ content: z.string() }) }),
              }),
            )
            .optional(),
        }),
      ),
    })
    .optional(),
})

const Channel = z.enum(['shop', 'retro', 'certificate', 'record', 'contract', 'milestone', 'mission', 'event'])

const Window = z.object({
  kind: z.enum(['first', 'rerun', 'retro']),
  n: z.number().int(),
  channel: Channel,
  start: z.number(),
  end: z.union([z.number(), z.null()]),
  price: z.union([z.string(), z.null()]),
  unit: z.union([z.string(), z.null()]),
})

const Shape = z.object({
  skins: z.record(
    z.object({
      windows: z.array(Window),
      noVoucher: z.boolean(),
      dynamic: z.boolean(),
    }),
  ),
})
