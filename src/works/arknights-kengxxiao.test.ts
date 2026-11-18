import { describe, expect, it } from 'vitest'
import { ArknightsKengxxiao, slimSpecialOperators } from './arknights-kengxxiao.js'

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
