import { MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArknightsKengxxiao, slimRecruit, slimSpecialOperators } from './arknights-kengxxiao.js'

const node = (nodeId: string, nodeType: string, unlockTaskId: string | null, frontNodeId: string | null = null) => ({
  nodeId,
  nodeType,
  isInGameMechanics: false,
  unlockEvolvePhase: 'PHASE_0',
  unlockLevel: 1,
  unlockTaskId,
  frontNodeId,
  ifAutoUnlock: unlockTaskId === null,
  conditionViewType: unlockTaskId === null ? 'EVOLVEPHASE' : 'TASK',
  topoOrder: 0,
})

const mission = (id: string, description: string) => ({
  id,
  sortId: 0,
  description,
  type: 'SPECIAL_OPERATOR',
  template: 'Rlv2PassZoneSpec',
  param: ['1', 'rogue_6'],
  missionGroup: 'char_4230_mcnist',
})

const table = {
  constData: {},
  modeData: [{ type: 'ROGUE', typeName: '集成战略' }],
  operatorBasicData: {
    char_4230_mcnist: {
      soCharId: 'char_4230_mcnist',
      sortId: 2,
      targetType: 'ROGUE',
      targetId: 'rogue_6',
      targetTopicName: '沉沦者的黑流树海',
      bgId: 'pic_rogue_6',
    },
  },
  operatorDetailData: {
    char_4230_mcnist: {
      specialOperatorExpMap: [
        [100, 113, -1, -1],
        [120, 137, 154, -1],
      ],
      detailConstData: {},
      tabData: {},
      nodeUnlockData: {
        mcnist_n_evolve_1: node('mcnist_n_evolve_1', 'EVOLVE', 'mcnist_t_evolve_1'),
        mcnist_n_skill1_1: node('mcnist_n_skill1_1', 'SKILL', null),
        mcnist_n_skill1_2: node('mcnist_n_skill1_2', 'SKILL', 'mcnist_t_skill_to4', 'mcnist_n_skill1_1'),
        mcnist_n_talent1_1: node('mcnist_n_talent1_1', 'TALENT', 'mcnist_t_talent'),
      },
      evolveNodeData: { mcnist_n_evolve_1: { nodeId: 'mcnist_n_evolve_1', toEvolvePhase: 'PHASE_1' } },
      skillNodeData: {
        mcnist_n_skill1_1: { nodeId: 'mcnist_n_skill1_1', skillKey: 'skchr_mcnist_1', skillLevel: 1, skillSpLevel: 0 },
        mcnist_n_skill1_2: { nodeId: 'mcnist_n_skill1_2', skillKey: 'skchr_mcnist_1', skillLevel: 4, skillSpLevel: 0 },
      },
      talentNodeData: {},
      uniEquipNodeData: {},
      nodeDiagramMap: {},
    },
  },
  nodeUnlockMissionData: {
    mcnist_t_evolve_1: mission('mcnist_t_evolve_1', '在集成战略：沉沦者的黑流树海的常规行动中，到达3层'),
    mcnist_t_skill_to4: mission('mcnist_t_skill_to4', '在集成战略：沉沦者的黑流树海的常规行动中，到达5层'),
    mcnist_t_talent: mission('mcnist_t_talent', '天赋'),
    mcnist_t_unused: mission('mcnist_t_unused', '没有节点引用'),
  },
  nodeUnlockMissionGroup: {},
}

const candidate = (masterId: string, level: number, name: string | null) => ({
  masterId,
  level,
  talentData: { unlockCondition: { phase: 'PHASE_0', level: 0 }, name, description: '……' },
})

describe('slimSpecialOperators', () => {
  const slim = slimSpecialOperators(table, {})
  const mcnist = slim.operatorDetailData.char_4230_mcnist as any

  it('drops the levels past each phase’s maximum', () => {
    expect(mcnist.specialOperatorExpMap).toEqual([
      [100, 113],
      [120, 137, 154],
    ])
  })

  it('drops talents and keeps six fields of each node', () => {
    expect(Object.keys(mcnist.nodeUnlockData)).toEqual(['mcnist_n_evolve_1', 'mcnist_n_skill1_1', 'mcnist_n_skill1_2'])
    expect(mcnist.nodeUnlockData.mcnist_n_skill1_2).toEqual({
      nodeId: 'mcnist_n_skill1_2',
      nodeType: 'SKILL',
      unlockEvolvePhase: 'PHASE_0',
      unlockLevel: 1,
      unlockTaskId: 'mcnist_t_skill_to4',
      frontNodeId: 'mcnist_n_skill1_1',
    })
  })

  it('keeps only the missions the kept nodes name', () => {
    expect(slim.nodeUnlockMissionData).toEqual({
      mcnist_t_evolve_1: { id: 'mcnist_t_evolve_1', description: '在集成战略：沉沦者的黑流树海的常规行动中，到达3层' },
      mcnist_t_skill_to4: {
        id: 'mcnist_t_skill_to4',
        description: '在集成战略：沉沦者的黑流树海的常规行动中，到达5层',
      },
    })
  })

  it('reads a missing node table as empty', () => {
    expect(mcnist.masterNodeData).toEqual({})
  })

  it('parses, reading an empty list written as {} as []', () => {
    const parsed = ArknightsKengxxiao.shape.exSpecialOperators.parse(
      slimSpecialOperators({ ...table, modeData: {} }, {}),
    )
    expect(parsed.modeData).toEqual([])
    expect(parsed.operatorBasicData).toEqual({
      char_4230_mcnist: { soCharId: 'char_4230_mcnist', targetType: 'ROGUE', targetTopicName: '沉沦者的黑流树海' },
    })
    expect(parsed.operatorDetailData.char_4230_mcnist.evolveNodeData).toEqual({
      mcnist_n_evolve_1: { nodeId: 'mcnist_n_evolve_1', toEvolvePhase: 'PHASE_1' },
    })
  })

  it('names the masters from either shape of the master table', () => {
    const candidates = [candidate('master_radian_6', 1, '历战精锐'), candidate('master_radian_6', 2, '历战精锐')]
    const expected = { master_radian_6: '历战精锐' }
    expect(slimSpecialOperators(table, { master_radian_6: { candidates } }).masterNames).toEqual(expected)
    expect(slimSpecialOperators(table, { candidates }).masterNames).toEqual(expected)
  })

  it('names a master after its first candidate with a name, and leaves out the masters without one', () => {
    const grouped = {
      master_mcnist_2: {
        candidates: [candidate('master_mcnist_2', 1, null), candidate('master_mcnist_2', 2, '战斗精通 II')],
      },
      master_mcnist_4: { candidates: [candidate('master_mcnist_4', 1, null)] },
    }
    expect(slimSpecialOperators(table, grouped).masterNames).toEqual({ master_mcnist_2: '战斗精通 II' })
  })
})

const gachaTags = (
  [
    [1, '近卫干员'],
    [2, '狙击干员'],
    [4, '医疗干员'],
    [6, '术师干员'],
    [9, '近战位'],
    [10, '远程位'],
    [11, '高级资深干员'],
    [14, '资深干员'],
    [15, '治疗'],
    [16, '支援'],
    [19, '输出'],
    [23, '减速'],
    [28, '支援机械'],
    [1012, '男性干员'],
  ] as const
).map(([tagId, tagName]) => ({ tagId, tagName, tagGroup: tagId }))

const operator = (name: string, rarity: number, profession: string, position: string, tagList: unknown) => ({
  name,
  rarity: `TIER_${rarity}`,
  profession,
  position,
  tagList,
})

const characters = {
  char_285_medic2: operator('Lancet-2', 1, 'MEDIC', 'RANGED', ['支援机械', '治疗']),
  char_4000_jnight: operator("'Justice Knight'", 1, 'SNIPER', 'RANGED', ['支援机械', '支援']),
  trap_4000_jnight: operator('Justice Knight', 1, 'TRAP', 'NONE', null),
  char_103_angel: operator('能天使', 6, 'SNIPER', 'RANGED', ['输出']),
  char_128_plosis: operator('白面鸮', 5, 'MEDIC', 'RANGED', ['治疗', '支援', '治疗']),
  char_1_same: operator('同名', 3, 'WARRIOR', 'MELEE', {}),
  char_2_same: operator('同名', 5, 'CASTER', 'RANGED', ['减速']),
  char_3_same: operator('同名', 4, 'WARRIOR', 'MELEE', ['不存在的词条']),
}

const gacha = (recruitDetail: string) => ({
  gachaTags,
  specialTagRarityTable: { '11': [5], '14': [4] },
  recruitDetail,
})

// zh_CN writes a backslash and an n after the stars, and parts the lines with \r\n and a rule
const cnDetail = [
  '<@rc.title>公开招募说明</>',
  '',
  '<@rc.em>当职业需求包含高级资深干员，且招募时限为9小时时，招募必得6星干员</>',
  '',
  '★\\n<@rc.eml>Lancet-2</> / <@rc.eml>Justice Knight</>',
  '--------------------',
  '★★★\\n同名',
  '--------------------',
  '★★★★★\\n<@rc.eml>白面鸮</> / 同名 / 查无此人',
  '--------------------',
  '★★★★★★\\n能天使',
].join('\r\n')

// The global servers write a real newline after the stars
const enDetail = [
  '<@rc.title>Recruit Rules</>',
  '',
  '★\nLancet-2 / Justice Knight',
  '--------------------',
  '★★★\n同名',
  '--------------------',
  '★★★★★\n白面鸮 / 同名 / 查无此人',
  '--------------------',
  '★★★★★★\n能天使',
].join('\n')

const tagsOf = (recruit: ReturnType<typeof slimRecruit>) =>
  Object.fromEntries(recruit.pool.map((x) => [x.charId, x.tags]))

describe('slimRecruit', () => {
  let warn: MockInstance<typeof console.warn>
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => warn.mockRestore())

  const expected = {
    char_285_medic2: [4, 10, 15, 28],
    char_4000_jnight: [2, 10, 16, 28],
    char_1_same: [1, 9],
    char_128_plosis: [4, 10, 14, 15, 16],
    char_2_same: [6, 10, 14, 23],
    char_103_angel: [2, 10, 11, 19],
  }

  it('reads both ways of writing the rules, in their order', () => {
    for (const detail of [cnDetail, enDetail]) {
      const recruit = slimRecruit(gacha(detail), characters)
      expect(recruit.pool.map((x) => x.charId)).toEqual(Object.keys(expected))
    }
  })

  it('turns profession, position, rarity and tagList into tag ids, deduplicated and in order', () => {
    expect(tagsOf(slimRecruit(gacha(cnDetail), characters))).toEqual(expected)
  })

  it('matches a name the character table quotes, and never a trap of the same name', () => {
    const pool = tagsOf(slimRecruit(gacha(enDetail), characters))
    expect(pool.char_4000_jnight).toEqual(expected.char_4000_jnight)
    expect(pool).not.toHaveProperty('trap_4000_jnight')
  })

  it('tells operators of one name apart by rarity', () => {
    const pool = tagsOf(slimRecruit(gacha(cnDetail), characters))
    expect(pool.char_1_same).toEqual([1, 9])
    expect(pool.char_2_same).toEqual([6, 10, 14, 23])
    expect(pool).not.toHaveProperty('char_3_same')
  })

  it('skips a name it cannot match, or matches twice, with a warning', () => {
    const twins = { ...characters, char_4_same: operator('同名', 3, 'SNIPER', 'RANGED', []) }
    const pool = tagsOf(slimRecruit(gacha(cnDetail), twins))
    expect(Object.keys(pool)).not.toContain('char_1_same')
    expect(Object.keys(pool)).not.toContain('char_4_same')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('查无此人'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('char_1_same'))
  })

  it('skips a tag it cannot name, with a warning', () => {
    expect(tagsOf(slimRecruit(gacha('★★★★\\n同名'), characters))).toEqual({ char_3_same: [1, 9] })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('不存在的词条'))
  })

  it('lists only the tags some operator in the pool carries', () => {
    const recruit = slimRecruit(gacha(cnDetail), characters)
    expect(recruit.tags.map((x) => x.tagId)).toEqual([1, 2, 4, 6, 9, 10, 11, 14, 15, 16, 19, 23, 28])
    expect(recruit.tags[0]).toEqual({ tagId: 1, tagName: '近卫干员' })
  })

  it('parses', () => {
    const recruit = slimRecruit(gacha(cnDetail), characters)
    expect(ArknightsKengxxiao.shape.exRecruit.parse(recruit)).toEqual(recruit)
  })
})
