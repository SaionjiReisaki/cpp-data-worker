// An if-effect's then is a list of leaves, never a function, so nothing awaits it as a promise.
/* oxlint-disable unicorn/no-thenable */
import { z } from 'zod'

// Base skill texts read as a few dozen sentence patterns. They are parsed from zh_CN only, into effects that name
// their nouns by reference, so that every region can show them with its own names; a client builds the sentences.

export const Metric = z.enum([
  // The main number of each room
  'prod',
  'order',
  'charge',
  'clue',
  'contact',
  'train',
  'byprod',
  'recycle',
  // Storage, order limit, mood cost per hour, mood recovery per hour
  'cap',
  'olimit',
  'cost',
  'recover',
])
export type Metric = z.output<typeof Metric>

export const Word = z.enum([
  // Manufacturing recipes
  'exp',
  'gold',
  'originium',
  'chip',
  // Workshop materials
  'eliteMaterial',
  'skillSummary',
  'buildingMaterial',
  'anyMaterial',
  'sameRoomOthers',
  'emptyOrder',
  'hireSlot',
  'droneCap',
  // Clue factions that have no term
  'clue.penguin',
  'clue.karlan',
  'clue.rhodes',
  'prof.PIONEER',
  'prof.WARRIOR',
  'prof.TANK',
  'prof.SNIPER',
  'prof.CASTER',
  'prof.MEDIC',
  'prof.SUPPORT',
  'prof.SPECIAL',
])
export type Word = z.output<typeof Word>

export const Noun = z.union([
  // ref is term:<termId>, char:<charId>, item:<itemId> or branch:<subProfessionId>; text is the region's name for it
  z.object({ ref: z.string(), text: z.string() }),
  z.object({ room: z.string() }),
  z.object({ word: Word }),
])
export type Noun = z.output<typeof Noun>

export const Target = z.union([
  z.enum(['self', 'room', 'one', 'allDorms', 'elsewhere']),
  z.object({ all: z.string() }),
  z.object({ at: z.string() }),
])
export type Target = z.output<typeof Target>

export const Each = z.object({
  n: z.number(),
  unit: z.enum(['op', 'room', 'level', 'point', 'line', 'slot']),
  what: z.array(Noun),
})
export type Each = z.output<typeof Each>

export const Note = z.enum([
  'missingClue',
  'missingClueExchange',
  'ownedClue',
  'clueOf',
  'goldOrderUp',
  'fixedOrder',
  'goldPerOrder',
  'noMoodCost',
  'noMoodCostFor',
  'byproductIs',
  'lessGold',
])
export type Note = z.output<typeof Note>

const leaves = [
  z.object({ k: z.literal('flat'), m: Metric, v: z.number(), of: z.array(Noun).optional(), to: Target.optional() }),
  z.object({ k: z.literal('ramp'), m: Metric, v0: z.number(), v1: z.number() }),
  z.object({
    k: z.literal('per'),
    m: Metric,
    v: z.number(),
    each: Each,
    of: z.array(Noun).optional(),
    maxCount: z.number().optional(),
    maxValue: z.number().optional(),
  }),
  z.object({ k: z.literal('zero'), m: Metric }),
  z.object({ k: z.literal('res'), what: Noun, v: z.number(), each: Each.optional() }),
  z.object({ k: z.literal('conv'), from: Noun, fromN: z.number(), to: Noun, toN: z.number() }),
  z.object({ k: z.literal('note'), note: Note, what: z.array(Noun).optional(), v: z.number().optional() }),
] as const

export const Leaf = z.discriminatedUnion('k', [...leaves])
export type Leaf = z.output<typeof Leaf>

export const Cond = z.discriminatedUnion('c', [
  z.object({ c: z.literal('with'), who: z.array(Noun), group: z.boolean() }),
  z.object({
    c: z.literal('at'),
    who: z.array(Noun),
    where: z.union([Noun, z.enum(['base', 'work', 'here'])]),
    min: z.number().optional(),
  }),
  z.object({ c: z.literal('mastery'), level: z.number() }),
  z.object({ c: z.literal('trainee'), who: z.array(Noun) }),
  z.object({ c: z.literal('alone') }),
  z.object({ c: z.literal('mood'), op: z.enum(['>', '<']), v: z.number() }),
  z.object({ c: z.literal('moodGap'), v: z.number() }),
  z.object({ c: z.literal('hours'), v: z.number() }),
  z.object({ c: z.literal('dormOthers') }),
  // Workshop recipes whose mood cost is v (or v and above)
  z.object({ c: z.literal('recipeMood'), v: z.number(), orMore: z.boolean().optional() }),
])
export type Cond = z.output<typeof Cond>

// Not recursive: a condition never holds another one, so the type zod-to-ts prints is complete.
export const Effect = z.discriminatedUnion('k', [
  ...leaves,
  z.object({ k: z.literal('if'), when: Cond, then: z.array(Leaf) }),
])
export type Effect = z.output<typeof Effect>

// ---------------------------------------------------------------------------------------------------------------------
// Nouns

export interface NounTables {
  /** zh_CN term name → termId, only for names no other term shares */
  terms: Map<string, string>
  chars: Map<string, string>
  rooms: Map<string, string>
  items: Map<string, string>
  branches: Map<string, string>
}

export function nounTables(zh: {
  buildingData: any
  characterTable: any
  gamedataConst: any
  itemTable: any
  uniequipTable: any
}): NounTables {
  const termCount = new Map<string, number>()
  for (const term of Object.values<any>(zh.gamedataConst.termDescriptionDict)) {
    termCount.set(term.termName, (termCount.get(term.termName) ?? 0) + 1)
  }
  const terms = new Map<string, string>()
  for (const [termId, term] of Object.entries<any>(zh.gamedataConst.termDescriptionDict)) {
    if (termCount.get(term.termName) === 1) terms.set(term.termName, termId)
  }

  const chars = new Map<string, string>()
  for (const [charId, char] of Object.entries<any>(zh.characterTable)) {
    if (charId.startsWith('char_') && !chars.has(char.name)) chars.set(char.name, charId)
  }

  // The texts also say 人力办公室 for 办公室 and 中枢 for 控制中枢.
  const rooms = new Map<string, string>([
    ['人力办公室', 'HIRE'],
    ['中枢', 'CONTROL'],
  ])
  for (const [roomType, room] of Object.entries<any>(zh.buildingData.rooms)) rooms.set(room.name, roomType)

  const items = new Map<string, string>()
  for (const [itemId, item] of Object.entries<any>(zh.itemTable.items)) {
    if (!items.has(item.name)) items.set(item.name, itemId)
  }

  const branches = new Map<string, string>()
  for (const [id, branch] of Object.entries<any>(zh.uniequipTable.subProfDict)) {
    branches.set(branch.subProfessionName, id)
  }

  return { terms, chars, rooms, items, branches }
}

const words: Record<string, Word> = {
  作战记录: 'exp',
  贵金属: 'gold',
  赤金: 'gold',
  源石: 'originium',
  芯片: 'chip',
  精英材料: 'eliteMaterial',
  技巧概要: 'skillSummary',
  基建材料: 'buildingMaterial',
  任意材料: 'anyMaterial',
  任意类材料: 'anyMaterial',
  招募位: 'hireSlot',
  无人机上限: 'droneCap',
  企鹅物流: 'clue.penguin',
  喀兰贸易: 'clue.karlan',
  罗德岛制药: 'clue.rhodes',
  先锋: 'prof.PIONEER',
  近卫: 'prof.WARRIOR',
  重装: 'prof.TANK',
  狙击: 'prof.SNIPER',
  术师: 'prof.CASTER',
  医疗: 'prof.MEDIC',
  辅助: 'prof.SUPPORT',
  特种: 'prof.SPECIAL',
}

class Unrecognized extends Error {}

interface State {
  room: string
  nouns: NounTables
  /** Text wrapped in <$termId> in this description → termId */
  marked: Map<string, string>
}

function lookup(s: string, st: State, wordsFirst: boolean): Noun | undefined {
  const forms = [s]
  const bare = s.replace(/^(?:其他|除自身以外的)/, '').replace(/(?:干员|成员)$/, '')
  if (bare !== s) forms.push(bare)
  const material = bare.replace(/类?材料$/, '')
  if (material !== bare && material) forms.push(material)

  for (const form of forms) {
    if (wordsFirst && words[form]) return { word: words[form] }
    const marked = st.marked.get(form) ?? st.marked.get(form + '干员')
    if (marked) return { ref: 'term:' + marked, text: form }
    const term = st.nouns.terms.get(form)
    if (term) return { ref: 'term:' + term, text: form }
    const char = st.nouns.chars.get(form)
    if (char) return { ref: 'char:' + char, text: form }
    const room = st.nouns.rooms.get(form)
    if (room) return { room }
    const item = st.nouns.items.get(form)
    if (item) return { ref: 'item:' + item, text: form }
    const branch = st.nouns.branches.get(form)
    if (branch) return { ref: 'branch:' + branch, text: form }
    if (words[form]) return { word: words[form] }
  }
  return undefined
}

/** One noun, or several joined by 与, 或, 、 or /; each has to be found. */
function nouns(s: string, st: State, wordsFirst = false): Noun[] {
  const one = lookup(s, st, wordsFirst)
  if (one) return [one]
  const parts = s.split(/与|或|、|\/|和/)
  if (parts.length < 2) throw new Unrecognized(s)
  return parts.map((part) => {
    const noun = lookup(part, st, wordsFirst)
    if (!noun) throw new Unrecognized(part)
    return noun
  })
}

/** The single noun a resource or a conversion names. */
function resourceNoun(s: string, st: State): Noun {
  const found = nouns(s, st)
  if (found.length !== 1) throw new Unrecognized(s)
  return found[0]
}

function room(s: string, st: State): string {
  const roomType = st.nouns.rooms.get(s.replace(/^当前/, ''))
  if (!roomType) throw new Unrecognized(s)
  return roomType
}

// ---------------------------------------------------------------------------------------------------------------------
// Text

const N = String.raw`(\d+(?:\.\d+)?)`

const metrics: [Metric, RegExp][] = [
  ['prod', /^(?:生产力)$/],
  ['order', /^(?:订单获取效率|获取效率|订单效率)$/],
  ['charge', /^(?:无人机充能速度|充能速度)$/],
  ['clue', /^(?:会客室)?(?:线索搜集速度)$/],
  ['contact', /^(?:人脉资源的联络速度|联络速度)$/],
  ['train', /^(?:专精技能训练速度|训练速度)$/],
  ['byprod', /^(?:副产品的产出概率)$/],
  ['recycle', /^(?:材料转化效率)$/],
  ['cap', /^(?:仓库容量上限|仓库容量|仓库上限容量)$/],
  ['olimit', /^(?:订单上限)$/],
  ['cost', /^(?:心情每小时消耗|每小时心情消耗)$/],
  ['recover', /^(?:心情每小时恢复速度|心情每小时恢复|每小时恢复|恢复效果)$/],
]

function metric(s: string): Metric | undefined {
  return metrics.find(([, re]) => re.test(s))?.[0]
}

const mainMetric: Record<string, Metric> = {
  MANUFACTURE: 'prod',
  TRADING: 'order',
  POWER: 'charge',
  MEETING: 'clue',
  HIRE: 'contact',
  TRAINING: 'train',
  WORKSHOP: 'byprod',
  RECYCLE: 'recycle',
  DORMITORY: 'recover',
}

interface Clause {
  text: string
  /** Followed by ；or 。rather than ，: what a header says stops here. */
  end: boolean
  maxCount?: number
  maxValue?: number
}

/** Strips the rich text tags, and notes which text each <$termId> tag wraps. */
function readMarkup(description: string) {
  const marked = new Map<string, string>()
  const stack: { term?: string; start: number }[] = []
  let text = ''
  let last = 0
  for (const m of description.matchAll(/<([@$])([^>]*)>|<\/>/g)) {
    text += description.slice(last, m.index)
    last = m.index + m[0].length
    if (m[1]) {
      stack.push({ term: m[1] === '$' ? m[2] : undefined, start: text.length })
    } else {
      const open = stack.pop()
      if (open?.term) marked.set(text.slice(open.start), open.term)
    }
  }
  text += description.slice(last)
  // One zh_CN text has a stray < before a noun.
  return { text: text.replace(/</g, ''), marked }
}

/** Splits at ，；。 outside brackets, and reads each clause's bracketed remarks. */
function splitClauses(text: string): Clause[] {
  const clauses: Clause[] = []
  const push = (raw: string, end: boolean) => {
    const c = clause(raw, end)
    // 「…，（与控制中枢加成有特殊比较规则）」: a remark standing alone belongs to the clause before it.
    const last = clauses[clauses.length - 1]
    if (c.text || !last) clauses.push(c)
    else
      Object.assign(last, {
        end: last.end || end,
        maxCount: last.maxCount ?? c.maxCount,
        maxValue: last.maxValue ?? c.maxValue,
      })
  }
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '（' || ch === '(') depth++
    if (ch === '）' || ch === ')') depth--
    if (depth === 0 && (ch === '，' || ch === '；' || ch === '。')) {
      if (current) push(current, ch !== '，')
      current = ''
    } else {
      current += ch
    }
  }
  if (current) push(current, true)
  return clauses
}

function clause(raw: string, end: boolean): Clause {
  const c: Clause = { text: '', end }
  c.text = raw.replace(/（([^（）]*)）|\(([^()]*)\)/g, (whole, a: string | undefined, b: string | undefined) => {
    const inner = a ?? b ?? ''
    let m
    if (/^(?:叠加后的最终值)?同种效果取最高$/.test(inner)) return ''
    if ((m = inner.match(/^最多(?:生效)?(\d+)(?:名|间)(?:，且同种效果取最高)?$/))) {
      c.maxCount = Number(m[1])
      return ''
    }
    if ((m = inner.match(new RegExp(String.raw`^最多\+?${N}%$`)))) {
      c.maxValue = Number(m[1])
      return ''
    }
    // Remarks on what counts, how effects stack, or what the duration affects
    if (/不包含|最少为|工作时长|不视作|仅影响|特殊|无法与|影响概率/.test(inner)) return ''
    return whole
  })
  return c
}

function stripLead(s: string) {
  return s.replace(/^(?:同时|且|则|但|并)/, '')
}

function value(sign: string | undefined, n: string) {
  return Number(n) * (sign === '-' ? -1 : 1)
}

// ---------------------------------------------------------------------------------------------------------------------
// Leaves read from a single clause

const VAL = String.raw`(?:额外)?(?:提升)?([+-]?)${N}(%)?`

const targets: [RegExp, (m: RegExpMatchArray, st: State) => Target | undefined][] = [
  [/^自身/, () => 'self'],
  [/^该宿舍内(?:除自身以外)?所有干员的?/, () => 'room'],
  [/^使该宿舍内(?:除自身以外)?心情未满的某个干员/, () => 'one'],
  [/^控制中枢内所有干员的?/, () => 'room'],
  [/^(?:当前)?(?:贸易站|制造站)内(?:全体)?(?:所有)?干员/, () => 'room'],
  [/^当前(?:制造站|贸易站)/, () => undefined],
  [/^所有宿舍内所有干员的/, () => 'allDorms'],
  [/^所有(制造站|贸易站)/, (m, st) => ({ all: room(m[1], st) })],
  [/^(会客室|人力办公室)/, (m, st) => ({ at: room(m[1], st) })],
  [/^其他设施内处于工作状态的干员/, () => 'elsewhere'],
  [/^全体/, () => 'room'],
]

type FlatLeaf = Extract<Leaf, { k: 'flat' }>

/** 「[谁的][哪类的]指标+N」 */
function flat(c: string, st: State, of?: Noun[]): FlatLeaf | undefined {
  c = stripLead(c)
  let to: Target | undefined
  let m: RegExpMatchArray | null
  if ((m = c.match(/^所有宿舍内(?!所有)(.+?)干员的/))) {
    to = 'allDorms'
    of = nouns(m[1], st)
    c = c.slice(m[0].length)
  } else if ((m = c.match(/^所有生产(.+?)类配方的(制造站)/))) {
    to = { all: room(m[2], st) }
    of = nouns(m[1], st, true)
    c = c.slice(m[0].length)
  } else {
    for (const [re, target] of targets) {
      if ((m = c.match(re))) {
        to = target(m, st)
        c = c.slice(m[0].length)
        break
      }
    }
  }

  let scope: string | undefined
  let mt: Metric | undefined
  m = c.match(new RegExp(String.raw`^(.+?)${VAL}$`))
  if (m) mt = metric(m[1])
  if (!mt) {
    m = c.match(new RegExp(String.raw`^(.+)的(.+?)${VAL}$`))
    if (!m) return undefined
    mt = metric(m[2])
    scope = m[1].replace(/类配方$/, '')
    if (/每|为|当前|如果|当/.test(scope)) return undefined
  }
  if (!mt || !m) return undefined
  const n = m.length === 6 ? 3 : 2
  const v = value(m[n], m[n + 1])
  const leaf: FlatLeaf = { k: 'flat', m: mt, v }
  if (scope && scope !== '干员') of = nouns(scope, st, true)
  if (of?.length) leaf.of = of
  if (to) leaf.to = to
  return leaf
}

/** Leaves a condition can carry: a number, a resource, or a note (null for a clause that adds nothing). */
function single(c: string, st: State, of?: Noun[]): Leaf | null | undefined {
  return flat(c, st, of) ?? resource(c, st) ?? note(c, st)
}

function resource(c: string, st: State): Extract<Leaf, { k: 'res' }> | undefined {
  c = stripLead(c)
  const m = c.match(new RegExp(String.raw`^(.+?)\+${N}$`))
  if (!m) return undefined
  const what = lookup(m[1], st, false)
  if (!what || !('ref' in what) || !what.ref.startsWith('term:')) return undefined
  return { k: 'res', what, v: Number(m[2]) }
}

const notes: [RegExp, (m: RegExpMatchArray, st: State) => Leaf | null][] = [
  [/^处于线索交流时更容易获得线索板上尚未拥有的线索$/, () => ({ k: 'note', note: 'missingClueExchange' })],
  [/^更容易获得线索板上尚未拥有的线索$/, () => ({ k: 'note', note: 'missingClue' })],
  [/^更容易获得线索板上已经拥有的线索$/, () => ({ k: 'note', note: 'ownedClue' })],
  [/^(?:小幅)?提升当前贸易站高品质贵金属订单的出现概率$/, () => ({ k: 'note', note: 'goldOrderUp' })],
  [/^更容易获得(.+?)线索$/, (m, st) => ({ k: 'note', note: 'clueOf', what: nouns(m[1], st) })],
  [/^消除自身心情消耗的影响$/, () => ({ k: 'note', note: 'noMoodCost' })],
  [
    /^消除当前(?:制造站|控制中枢)内所有(.*?)干员自身心情消耗的影响$/,
    (m, st) => ({ k: 'note', note: 'noMoodCostFor', what: m[1] ? nouns(m[1], st) : [] }),
  ],
  [/^固定获取(.+)$/, (m, st) => ({ k: 'note', note: 'fixedOrder', what: nouns(m[1], st) })],
  // What a fixed order is spared; the summary already says it is fixed.
  [/^该类订单不受任何订单获取效率的影响$/, () => null],
  [/^副产品必定为(.+)$/, (m, st) => ({ k: 'note', note: 'byproductIs', what: nouns(m[1], st) })],
  [/^减免龙门币消耗$/, () => ({ k: 'note', note: 'lessGold' })],
  [
    new RegExp(String.raw`^当前贸易站赤金订单的赤金交付数必定为${N}$`),
    (m) => ({ k: 'note', note: 'goldPerOrder', v: Number(m[1]) }),
  ],
]

/** A note, or null for a clause that adds nothing to the summary. */
function note(c: string, st: State): Leaf | null | undefined {
  c = stripLead(c)
  for (const [re, take] of notes) {
    const m = c.match(re)
    if (m) return take(m, st)
  }
  return undefined
}

// ---------------------------------------------------------------------------------------------------------------------
// Rules: each looks at the clause at st.i and may eat the ones after it.

interface Run extends State {
  clauses: Clause[]
  i: number
  of?: Noun[]
  out: Effect[]
}

interface Rule {
  name: string
  pattern: RegExp
  /** The effects read, or undefined when the clause only looked like this rule's. Advances run.i past what it ate. */
  take(m: RegExpMatchArray, run: Run): Effect[] | undefined
}

const units: Record<string, Each['unit']> = {
  名: 'op',
  台: 'op',
  个: 'op',
  条: 'line',
  间: 'room',
  一间: 'room',
  点: 'point',
  瓶: 'point',
  架: 'point',
  层: 'point',
  笔: 'slot',
}

/** 「X」 for a 每…X header, with the place it names when the place goes without saying for the metric. */
function eachWhat(s: string, run: Run, m: Metric | undefined): Noun[] {
  let r: RegExpMatchArray | null
  if ((r = s.match(/^进驻在(.+?)的(.+)$/)) ?? (r = s.match(/^(.+?)进驻(.+)$/))) {
    const [place, who] = s.startsWith('进驻在') ? [r[1], r[2]] : [r[2], r[1]]
    if (!m || mainMetric[room(place, run)] !== m) throw new Unrecognized(s)
    return nouns(who, run)
  }
  if (/^当前(?:制造站|贸易站)内(?:干员)?$/.test(s)) return [{ room: run.room }]
  return nouns(s, run)
}

function eachUnit(u: string | undefined, what: Noun[]): Each['unit'] {
  const unit = units[u ?? '个'] ?? 'op'
  // 每有1个木天蓼: a resource counts in points
  if (unit === 'op' && what.every((n) => 'ref' in n && n.ref.startsWith('term:cc.bd'))) return 'point'
  return unit
}

function perOf(f: FlatLeaf, each: Each, c: Clause[]): Extract<Leaf, { k: 'per' }> {
  const leaf: Extract<Leaf, { k: 'per' }> = { k: 'per', m: f.m, v: f.v, each }
  if (f.of) leaf.of = f.of
  for (const x of c) {
    if (x.maxCount != null) leaf.maxCount = x.maxCount
    if (x.maxValue != null) leaf.maxValue = x.maxValue
  }
  return leaf
}

/** Consumes the flats after a header until the sentence ends; at least one. */
function following<T>(run: Run, read: (c: Clause) => T | undefined): T[] {
  const out: T[] = []
  while (run.i < run.clauses.length && !run.clauses[run.i - 1].end) {
    const x = read(run.clauses[run.i])
    if (x === undefined) break
    out.push(x)
    run.i++
  }
  return out
}

function lastFlat(run: Run): FlatLeaf | undefined {
  const last = run.out[run.out.length - 1]
  return last?.k === 'flat' ? last : undefined
}

const conds: [RegExp, (m: RegExpMatchArray, st: State) => Cond][] = [
  [/^当与(.+?)在同一个(?:贸易站|制造站)时$/, (m, st) => ({ c: 'with', who: nouns(m[1], st), group: false })],
  [
    /^(?:当)?与(?:其他)?(.+?)(?:一起)?进驻(?:会客室|控制中枢)一起工作时$/,
    (m, st) => ({ c: 'with', who: nouns(m[1], st), group: true }),
  ],
  [/^当(.+?)在基建内时$/, (m, st) => ({ c: 'at', who: nouns(m[1], st), where: 'base' })],
  [
    /^如果有(\d+)台以上(.+?)进驻在(.+)$/,
    (m, st) => ({ c: 'at', who: nouns(m[2], st), where: { room: room(m[3], st) }, min: Number(m[1]) }),
  ],
  [
    /^(?:如果|若)(.+?)进驻(?:在)?(.+)$/,
    (m, st) => ({ c: 'at', who: nouns(m[1], st), where: { room: place(m[2], st) } }),
  ],
  [/^若(.+?)在(.+)$/, (m, st) => ({ c: 'at', who: nouns(m[1], st), where: { room: room(m[2], st) } })],
  [/^当前贸易站内存在(.+?)干员时$/, (m, st) => ({ c: 'at', who: nouns(m[1], st), where: 'here' })],
  [/^当(.+?)入驻工作场所时$/, (m, st) => ({ c: 'at', who: nouns(m[1], st), where: 'work' })],
  [/^当(.+?)入驻(.+?)时$/, (m, st) => ({ c: 'at', who: nouns(m[1], st), where: { room: room(m[2], st) } })],
  [/^如果本次训练专精技能至(\d)级$/, (m) => ({ c: 'mastery', level: Number(m[1]) })],
  [/^如果训练位干员分支为(.+)$/, (m, st) => ({ c: 'trainee', who: nouns(m[1], st) })],
  [/^如果目标是(.+)$/, (m, st) => ({ c: 'trainee', who: nouns(m[1], st) })],
  [/^如果会客室内只有自身处于工作状态时$/, () => ({ c: 'alone' })],
  [/^当自身心情落差大于(\d+)时$/, (m) => ({ c: 'moodGap', v: Number(m[1]) })],
  [/^当自身心情大于(\d+)时$/, (m) => ({ c: 'mood', op: '>', v: Number(m[1]) })],
  [/^当自身心情处于(\d+)以下时$/, (m) => ({ c: 'mood', op: '<', v: Number(m[1]) })],
  [/^若单次工作时长达到(\d+)小时$/, (m) => ({ c: 'hours', v: Number(m[1]) })],
  [/^如果该宿舍内有其他干员$/, () => ({ c: 'dormOthers' })],
]

/** 训练室协助位 is a place in the training room. */
function place(s: string, st: State) {
  return room(s.replace(/协助位$/, ''), st)
}

const rules: Rule[] = [
  {
    name: 'recipe',
    pattern: /^生产(.+?)类配方时$/,
    take(m, run) {
      run.of = nouns(m[1], run, true)
      run.i++
      return []
    },
  },
  {
    name: 'flat',
    pattern: /^.+$/,
    take(m, run) {
      const leaf = flat(m[0], run, run.of)
      if (!leaf) return undefined
      run.i++
      return [leaf]
    },
  },
  {
    name: 'ramp',
    pattern: new RegExp(String.raw`^(.+?)首小时\+${N}%$`),
    take(m, run) {
      const [a, b] = [run.clauses[run.i + 1], run.clauses[run.i + 2]]
      const mt = metric(m[1])
      if (!mt || !a || !b) return undefined
      if (!new RegExp(String.raw`^此后每小时(?:\+|提升)${N}%$`).test(stripLead(a.text))) return undefined
      const end = stripLead(b.text).match(new RegExp(String.raw`^最终达到\+?${N}%$`))
      if (!end) return undefined
      run.i += 3
      return [{ k: 'ramp', m: mt, v0: Number(m[2]), v1: Number(end[1]) }]
    },
  },
  {
    name: 'ramp from zero',
    pattern: new RegExp(String.raw`^(.+?)每小时\+${N}%$`),
    take(m, run) {
      const mt = metric(m[1])
      const end = run.clauses[run.i + 1]?.text.match(new RegExp(String.raw`^最终达到\+?${N}%$`))
      if (!mt || !end) return undefined
      run.i += 2
      return [{ k: 'ramp', m: mt, v0: 0, v1: Number(end[1]) }]
    },
  },
  {
    name: 'ramp after a flat',
    pattern: new RegExp(String.raw`^此后每小时(?:\+|提升)${N}%$`),
    take(_m, run) {
      const f = lastFlat(run)
      const end = run.clauses[run.i + 1]?.text.match(new RegExp(String.raw`^最终达到\+?${N}%$`))
      if (!f || f.of || f.to || !end) return undefined
      run.out.pop()
      run.i += 2
      return [{ k: 'ramp', m: f.m, v0: f.v, v1: Number(end[1]) }]
    },
  },
  {
    name: 'zero',
    pattern: /^当前(?:制造站|贸易站)内其他干员提供的(.+?)全部归零$/,
    take(m, run) {
      const mt = metric(m[1])
      if (!mt) return undefined
      run.i++
      return [{ k: 'zero', m: mt }]
    },
  },
  {
    name: 'per resource point',
    pattern: new RegExp(String.raw`^每(?:拥有)?${N}(点|个|瓶|架)(.+?)(?:额外)?(?:\+|提升)${N}%(.*)$`),
    take(m, run) {
      // 「每1点情报储备额外提升5%」 goes on with the number before it.
      const mt = m[5] ? metric(m[5].replace(/^的/, '')) : lastFlat(run)?.m
      if (!mt) return undefined
      const what = nouns(m[3], run)
      const f: FlatLeaf = { k: 'flat', m: mt, v: Number(m[4]) }
      run.i++
      return [perOf(f, { n: Number(m[1]), unit: eachUnit(m[2], what), what }, [run.clauses[run.i - 1]])]
    },
  },
  {
    name: 'per room, for this room',
    pattern: new RegExp(String.raw`^每(?:个|间)(.+?)为当前(?:制造站|贸易站)(.*?)\+${N}%的?(.+)$`),
    take(m, run) {
      const mt = metric(m[4])
      // 「每个当前制造站内干员」 counts operators, not rooms.
      if (!mt || m[1].startsWith('当前')) return undefined
      const f: FlatLeaf = { k: 'flat', m: mt, v: Number(m[3]) }
      const scope = m[2].replace(/类配方的$/, '')
      if (scope) f.of = nouns(scope, run, true)
      const what = nouns(m[1], run)
      run.i++
      return [perOf(f, { n: 1, unit: 'room', what }, [])]
    },
  },
  {
    name: 'per room, recipe after',
    pattern: new RegExp(String.raw`^每个(.+?)为当前制造站(.+?)类配方的(.+?)\+${N}%$`),
    take(m, run) {
      const mt = metric(m[3])
      if (!mt) return undefined
      const f: FlatLeaf = { k: 'flat', m: mt, v: Number(m[4]), of: nouns(m[2], run, true) }
      const what = nouns(m[1], run)
      run.i++
      return [perOf(f, { n: 1, unit: 'room', what }, [])]
    },
  },
  {
    name: 'per operator, for oneself',
    pattern: new RegExp(
      String.raw`^(?:基建内)?(?:当前(?:制造站|贸易站)内)?每(?:个|名)(.+?)为(?:自身|当前干员的?|当前制造站|当前贸易站|该宿舍内所有干员)(.*?)([+-])${N}(%?)的?(.*)$`,
    ),
    take(m, run) {
      const mt = metric(m[2] || m[6])
      if (!mt || (m[2] && m[6])) return undefined
      const what = eachWhat(m[1].replace(/干员$/, ''), run, mt)
      const each: Each = { n: 1, unit: 'op', what }
      const header = run.clauses[run.i]
      run.i++
      // 「…为当前制造站+10%生产力，仓库容量上限+5」: the rest of the sentence is per operator too.
      const rest = following(run, (c) => {
        const f = flat(c.text, run)
        return f && !f.to && !f.of ? f : undefined
      })
      const first: FlatLeaf = { k: 'flat', m: mt, v: value(m[3], m[4]) }
      return [first, ...rest].map((f) => perOf(f, each, [header]))
    },
  },
  {
    name: 'per other operator',
    pattern: new RegExp(String.raw`^(?:贸易站内)?除自身以外每名处于工作状态的干员\+${N}%(.+)$`),
    take(m, run) {
      const mt = metric(m[2])
      if (!mt) return undefined
      run.i++
      return [
        perOf({ k: 'flat', m: mt, v: Number(m[1]) }, { n: 1, unit: 'op', what: [{ word: 'sameRoomOthers' }] }, []),
      ]
    },
  },
  {
    name: 'per operator here',
    pattern: new RegExp(String.raw`^每人为自身\+${N}%(.+)$`),
    take(m, run) {
      const mt = metric(m[2])
      if (!mt) return undefined
      run.i++
      return [perOf({ k: 'flat', m: mt, v: Number(m[1]) }, { n: 1, unit: 'op', what: [{ room: run.room }] }, [])]
    },
  },
  {
    name: 'per empty order',
    pattern: /^当前订单数与订单上限每差1笔订单$/,
    take(_m, run) {
      const f = run.clauses[run.i + 1] && flat(run.clauses[run.i + 1].text, run)
      if (!f) return undefined
      run.i += 2
      return [perOf(f, { n: 1, unit: 'slot', what: [{ word: 'emptyOrder' }] }, [])]
    },
  },
  {
    name: 'per hire slot',
    pattern: new RegExp(String.raw`^每个招募位(?:额外)?(?:使)?(?:\+|提升)?(.*?)([+-]?)${N}(%?)(.*)$`),
    take(m, run) {
      const mt = metric(m[1] || m[5])
      if (!mt || (m[1] && m[5])) return undefined
      run.i++
      return [
        perOf({ k: 'flat', m: mt, v: value(m[2], m[3]) }, { n: 1, unit: 'slot', what: [{ word: 'hireSlot' }] }, []),
      ]
    },
  },
  {
    name: 'per level',
    pattern: new RegExp(
      String.raw`^(?:每间)?(宿舍|会客室|训练室|当前宿舍|当前贸易站)每级(?:额外)?(?:为(.*?))?(?:提供)?\+?${N}(%?)(.*)$`,
    ),
    take(m, run) {
      let of: Noun[] | undefined
      let inner = (m[2] ?? '').replace(/额外$/, '')
      const r = inner.match(/^(.+?)类配方的(.+)$/)
      if (r) {
        of = nouns(r[1], run, true)
        inner = r[2]
      }
      inner = inner.replace(/^当前(?:制造站|贸易站)$/, '')
      const rest = m[5].replace(/^(?:个|的)/, '')
      let mt = metric(inner) ?? metric(rest)
      if (!mt && rest === '获取效率') mt = 'order'
      if (!mt && !inner && !rest && m[4]) mt = mainMetric[run.room]
      if (!mt || (inner && rest)) return undefined
      const f: FlatLeaf = { k: 'flat', m: mt, v: Number(m[3]) }
      if (of) f.of = of
      const leaf = perOf(f, { n: 1, unit: 'level', what: [{ room: room(m[1], run) }] }, [])
      run.i++
      const max = run.clauses[run.i]?.text.match(new RegExp(String.raw`^最多(?:提供)?${N}%(?:效率|生产力)?$`))
      if (max) {
        leaf.maxValue = Number(max[1])
        run.i++
      }
      return [leaf]
    },
  },
  {
    name: 'conversion',
    pattern: new RegExp(String.raw`^每${N}(?:点|个|层)(.+?)转化为${N}点(.+)$`),
    take(m, run) {
      const from = resourceNoun(m[2], run)
      const to = resourceNoun(m[4], run)
      run.i++
      return [{ k: 'conv', from, fromN: Number(m[1]), to, toN: Number(m[3]) }]
    },
  },
  {
    name: 'resource per dorm operator',
    pattern: new RegExp(String.raw`^(?:宿舍内)?每有1名干员则(.+?)\+${N}$`),
    take(m, run) {
      const what = resourceNoun(m[1], run)
      run.i++
      return [{ k: 'res', what, v: Number(m[2]), each: { n: 1, unit: 'op', what: [{ room: 'DORMITORY' }] } }]
    },
  },
  {
    name: 'resource per level or slot',
    pattern: new RegExp(String.raw`^(当前宿舍每级提供|每个招募位\+?)${N}(?:点|层|个)?(.+)$`),
    take(m, run) {
      const what = resourceNoun(m[3], run)
      const each: Each = m[1].startsWith('当前宿舍')
        ? { n: 1, unit: 'level', what: [{ room: 'DORMITORY' }] }
        : { n: 1, unit: 'slot', what: [{ word: 'hireSlot' }] }
      run.i++
      return [{ k: 'res', what, v: Number(m[2]), each }]
    },
  },
  {
    name: 'per, then the numbers',
    pattern:
      /^(?:基建内)?(同个贸易站中|同一贸易站中|该宿舍内|宿舍内|控制中枢内|制造站|自身)?每(?:拥有|有)?(?:一)?(\d+)?(名|个|条|间|点|台|架|瓶|笔|层)?(.+?)(?:干员)?$/,
    take(m, run) {
      const header = run.clauses[run.i]
      run.i++
      const read = following(run, (c) => flat(c.text, run, run.of) ?? more(c.text, run) ?? resource(c.text, run))
      const first = read.find((x) => x.k === 'flat')
      if (!read.length || (!first && read.length > 1)) {
        run.i--
        return undefined
      }
      // 「宿舍内每有1名干员」: the place is what is counted.
      const what =
        m[4] === '干员' && m[1] ? [{ room: room(m[1].replace(/^该|内$/g, ''), run) }] : eachWhat(m[4], run, first?.m)
      const each: Each = { n: Number(m[2] ?? 1), unit: eachUnit(m[3], what), what }
      return read.map((x) => (x.k === 'flat' ? perOf(x, each, [header, run.clauses[run.i - 1]]) : { ...x, each }))
    },
  },
  {
    name: 'each of them at work',
    pattern: /^当(.+?)入驻工作场所时$/,
    take(m, run) {
      const r = run.clauses[run.i + 1]?.text.match(new RegExp(String.raw`^(.+?)分别额外\+${N}%$`))
      const mt = r && metric(r[1])
      if (!mt) return undefined
      const what = nouns(m[1], run)
      run.i += 2
      return [perOf({ k: 'flat', m: mt, v: Number(r[2]) }, { n: 1, unit: 'op', what }, [])]
    },
  },
  {
    name: 'recipe mood cost',
    pattern: /^(?:(?:心情消耗为(\d+)(以上)?的配方全部)|相应配方全部)([+-])(\d+)心情消耗$/,
    take(m, run) {
      const leaf: FlatLeaf = { k: 'flat', m: 'cost', v: value(m[3], m[4]) }
      if (run.of) leaf.of = run.of
      run.i++
      if (!m[1]) return [leaf]
      const when: Cond = { c: 'recipeMood', v: Number(m[1]) }
      if (m[2]) when.orMore = true
      return [{ k: 'if', when, then: [leaf] }]
    },
  },
  {
    name: 'condition',
    pattern: /^.+$/,
    take(m, run) {
      for (const [re, read] of conds) {
        const r = m[0].match(re)
        if (!r) continue
        const when = read(r, run)
        run.i++
        const then = following(run, (c) => single(c.text, run, run.of) ?? more(c.text, run)).filter(
          (x): x is Leaf => x != null,
        )
        if (!then.length) throw new Unrecognized(m[0])
        return [{ k: 'if', when, then }]
      }
      return undefined
    },
  },
  {
    name: 'resource or note',
    pattern: /^.+$/,
    take(m, run) {
      const leaf = resource(m[0], run) ?? note(m[0], run)
      if (leaf === undefined) return undefined
      run.i++
      return leaf ? [leaf] : []
    },
  },
]

/** 「额外-0.01」 after a header: more of the number just before it. */
function more(c: string, run: Run): FlatLeaf | undefined {
  const m = stripLead(c).match(new RegExp(String.raw`^额外(?:提升)?([+-]?)${N}(%?)$`))
  const f = m && lastFlat(run)
  if (!f) return undefined
  return { k: 'flat', m: f.m, v: value(m[1], m[2]) }
}

// ---------------------------------------------------------------------------------------------------------------------

export type ParseResult = { effects: Effect[] } | { failed: string }

/** Reads a zh_CN base skill description. failed is the first clause no rule reads. */
export function parseBuff(description: string, roomType: string, tables: NounTables): ParseResult {
  const { text, marked } = readMarkup(description)
  const st: State = { room: roomType, nouns: tables, marked }
  let rest = text
  let of: Noun[] | undefined
  let whole: Cond | undefined

  try {
    let m: RegExpMatchArray | null
    if ((m = rest.match(/^进驻([^，]+?)(?:加工(.+?))?(?:时|后)，/))) {
      rest = rest.slice(m[0].length)
      // 「加工精英材料产出T3品质的副产品时」 is said by a note on which by-product it is.
      let what = m[2]?.replace(/产出T3品质的副产品$/, '')
      let r = what?.match(/^原始心情消耗为(\d+)的(.+)$/)
      if (r) {
        whole = { c: 'recipeMood', v: Number(r[1]) }
        what = r[2]
      }
      if (what) of = nouns(what, st, true)
      if ((r = m[1].match(/^训练室协助(.+?)干员训练专精技能至(\d)级$/))) {
        of = nouns(r[1], st, true)
        whole = { c: 'mastery', level: Number(r[2]) }
      }
    } else if (
      (m = rest.match(
        /^当与(.+?)(?:在同一个(?:贸易站|制造站)|(?:一起)?进驻(?:控制中枢|会客室)一起工作|一起进驻控制中枢)时，/,
      ))
    ) {
      rest = rest.slice(m[0].length)
      whole = { c: 'with', who: nouns(m[1], st), group: !m[0].includes('同一个') }
    } else {
      return { failed: splitClauses(text)[0]?.text ?? text }
    }
  } catch (e) {
    if (e instanceof Unrecognized) return { failed: splitClauses(text)[0]?.text ?? text }
    throw e
  }

  const run: Run = { ...st, clauses: splitClauses(rest), i: 0, of, out: [] }
  while (run.i < run.clauses.length) {
    const c = run.clauses[run.i]
    const text = stripLead(c.text)
    let read: Effect[] | undefined
    try {
      for (const rule of rules) {
        const m = text.match(rule.pattern)
        if (!m) continue
        read = rule.take(m, run)
        if (read) break
      }
    } catch (e) {
      if (e instanceof Unrecognized) return { failed: c.text }
      throw e
    }
    if (!read) return { failed: c.text }
    run.out.push(...read)
  }

  if (!run.out.length) return { failed: text }
  // A remark nothing consumed, such as a cap on a plain number, would go missing from the summary.
  for (const c of run.clauses) {
    if ((c.maxCount != null || c.maxValue != null) && !run.out.some((e) => usesCap(e, c))) return { failed: c.text }
  }
  if (whole) {
    const then = run.out.filter((e): e is Leaf => e.k !== 'if')
    if (then.length < run.out.length) return { failed: text }
    return { effects: [{ k: 'if', when: whole, then }] }
  }
  return { effects: run.out }
}

function usesCap(e: Effect, c: Clause): boolean {
  if (e.k === 'if') return e.then.some((x) => usesCap(x, c))
  if (e.k !== 'per') return false
  return (c.maxCount != null && e.maxCount === c.maxCount) || (c.maxValue != null && e.maxValue === c.maxValue)
}

// ---------------------------------------------------------------------------------------------------------------------
// Regions

export interface RegionNames {
  term(id: string): string | undefined
  char(id: string): string | undefined
  item(id: string): string | undefined
  branch(id: string): string | undefined
}

export function regionNames(local: {
  gamedataConst: any
  characterTable: any
  itemTable: any
  uniequipTable: any
}): RegionNames {
  return {
    term: (id) => local.gamedataConst.termDescriptionDict[id]?.termName,
    char: (id) => local.characterTable[id]?.name,
    item: (id) => local.itemTable.items[id]?.name,
    branch: (id) => local.uniequipTable.subProfDict[id]?.subProfessionName,
  }
}

/** The same effects with the region's names, or null when the region lacks one of them. */
export function localizeEffects(effects: Effect[], names: RegionNames): Effect[] | null {
  let missing = false
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk)
    if (x === null || typeof x !== 'object') return x
    if ('ref' in x && typeof x.ref === 'string') {
      const [kind, ...rest] = x.ref.split(':')
      const id = rest.join(':')
      const lookup = names[kind as keyof RegionNames] as RegionNames['term'] | undefined
      const text = lookup?.(id)
      if (text == null) missing = true
      return { ref: x.ref, text: text ?? '' }
    }
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v)]))
  }
  const out = walk(effects) as Effect[]
  return missing ? null : out
}

/** Whether two texts carry the same numbers in the same order, after their tags go and full-width digits narrow. */
export function sameNumbers(zh: string, local: string): boolean {
  const numbers = (s: string) =>
    readMarkup(s)
      .text.normalize('NFKC')
      .match(/\d+(\.\d+)?/g) ?? []
  const a = numbers(zh)
  const b = numbers(local)
  return a.length === b.length && a.every((x, i) => x === b[i])
}
