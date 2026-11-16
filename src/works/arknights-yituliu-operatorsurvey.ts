import { DateTime } from 'luxon'
import { z } from 'zod'
import { buildData, readData } from '../dc-utils.js'
import { unwrapZod } from '../zutils.js'
import type { ArknightsKengxxiao } from './arknights-kengxxiao.js'

export async function makeArknightsYituliuOperatorSurvey() {
  const file = 'arknights-yituliu-operatorsurvey'

  await buildData(
    file,
    async () => {
      const res = await fetch('https://auth.yituliu.cn/open/ak-operator-statistics/result')
      if (!res.ok) throw new Error('Unexpected response status: ' + res.status)
      const body = await res.json()
      if (body.code !== 200) throw new Error('Unexpected response code: ' + body.code)

      // The statistics endpoint carries no update time, so the fetch time is the version; buildData still skips
      // the commit when the converted data is unchanged.
      const now = new Date()
      const nowText = now.toJSON()
      const version = {
        id: nowText,
        text: nowText,
        timestamp: now.getTime(),
        sources: ['https://ark.yituliu.cn'],
        schema: 0,
      }
      version.schema = 1
      return [version, body, now]
    },
    async (body, now) => {
      const excel = await readData<z.TypeOf<typeof ArknightsKengxxiao>>('arknights-kengxxiao-zh_CN')
      const rows = unwrapZod(RawShape.safeParse(body.data))

      const data = {
        result: rows.map((row) => {
          const char = excel.data.exCharacters[row.charId] ?? excel.data.exPatchCharacters.patchChars[row.charId]
          if (!char) throw new Error('Cannot find character: ' + row.charId)

          return {
            charId: row.charId,
            rarity: parseInt(char.rarity.replace(/^TIER_/, ''), 10),
            own: ratio(row.own, row.sampleSize),
            elite: item(row.elite, row.own),
            skill1: item(row.skill1, row.own),
            skill2: item(row.skill2, row.own),
            skill3: item(row.skill3, row.own),
            modX: item(row.modX, row.own),
            modY: item(row.modY, row.own),
            modD: item(row.modD, row.own),
            modA: item(row.modA, row.own),
            modB: item(row.modB, row.own),
          }
        }),
        userCount: Math.max(...rows.map((row) => row.sampleSize)),
        updateTime: DateTime.fromJSDate(now, { zone: 'Asia/Shanghai' }).toFormat('yyyy-MM-dd HH:mm:ss'),
      }

      return [unwrapZod(Shape.safeParse(data)), Shape]
    },
  )
}

function ratio(a: number, b: number) {
  return b === 0 ? 0 : a / b
}

// Upstream counts players per level; the published shape keeps the old endpoint's fractions of owners. Levels above
// 3 are bogus submissions and are left out of every rank, so ranks may sum to slightly less than 1.
function item(counts: Record<string, number>, own: number) {
  if (own === 0) return { rank0: 1, rank1: 0, rank2: 0, rank3: 0, count: 0 }
  const rank1 = ratio(counts['1'] ?? 0, own)
  const rank2 = ratio(counts['2'] ?? 0, own)
  const rank3 = ratio(counts['3'] ?? 0, own)
  return {
    rank0: ratio(counts['0'] ?? 0, own),
    rank1,
    rank2,
    rank3,
    count: Math.min(1, rank1 + rank2 + rank3),
  }
}

const RawCounts = z.record(z.string().regex(/^\d+$/), z.number().int().nonnegative())

const RawShape = z.array(
  z.object({
    charId: z.string().regex(/^char_\d+_/),
    own: z.number().int().nonnegative(),
    sampleSize: z.number().int().positive(),
    elite: RawCounts,
    skill1: RawCounts,
    skill2: RawCounts,
    skill3: RawCounts,
    modX: RawCounts,
    modY: RawCounts,
    modD: RawCounts,
    modA: RawCounts,
    modB: RawCounts,
  }),
)

const SurveyNumber = z.number().min(0).max(1)

const SurveyItem = z.object({
  rank0: SurveyNumber,
  rank1: SurveyNumber,
  rank2: SurveyNumber,
  rank3: SurveyNumber,
  count: SurveyNumber,
})

const Shape = z.object({
  result: z.array(
    z.object({
      charId: z.string().regex(/^char_\d+_/),
      rarity: z.number().int().min(1).max(6),
      own: SurveyNumber,
      elite: SurveyItem,
      skill1: SurveyItem,
      skill2: SurveyItem,
      skill3: SurveyItem,
      modX: SurveyItem,
      modY: SurveyItem,
      modD: SurveyItem,
      modA: SurveyItem.optional(),
      modB: SurveyItem.optional(),
    }),
  ),
  userCount: z.number().int().nonnegative(),
  updateTime: z.string(),
})
