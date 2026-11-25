import { describe, expect, it } from 'vitest'
import { Details, readPotentials } from './arknights-kengxxiao-details.js'

const candidate = (
  phase: string | number,
  level: number,
  potential: number,
  description: string | null,
  extra: object = {},
) => ({
  unlockCondition: { phase, level },
  requiredPotentialRank: potential,
  prefabKey: '1',
  name: '紧急除颤',
  description,
  rangeId: null,
  blackboard: [],
  tokenKey: null,
  isHideTalent: false,
  ...extra,
})

const rank = (description: string | null) => ({ type: 'BUFF', description, buff: null, equivalentCost: null })

const ranks = ['部署费用-1', '第一天赋效果增强', '攻击力+28', '第二天赋效果增强', '部署费用-1'].map(rank)

const noPatches = { infos: {}, patchChars: {} }

const potentials = (character: object, patchChars: object = {}) =>
  readPotentials({ char_017_huang: character }, { infos: {}, patchChars })

describe('readPotentials', () => {
  it('keeps the texts of the highest elite phase, by potential ascending', () => {
    const out = potentials({
      potentialRanks: ranks,
      talents: [
        {
          candidates: [
            candidate('PHASE_1', 1, 0, '3秒'),
            candidate('PHASE_1', 1, 2, '4<@ba.talpu>（+1）</>秒'),
            candidate('PHASE_2', 1, 2, '7<@ba.talpu>（+1）</>秒'),
            candidate('PHASE_2', 1, 0, '6秒'),
          ],
        },
      ],
    })
    expect(out).toEqual({
      char_017_huang: {
        ranks: ['部署费用-1', '第一天赋效果增强', '攻击力+28', '第二天赋效果增强', '部署费用-1'],
        talents: [
          {
            candidates: [
              { potential: 0, name: '紧急除颤', desc: '6秒' },
              { potential: 2, name: '紧急除颤', desc: '7<@ba.talpu>（+1）</>秒' },
            ],
          },
        ],
      },
    })
  })

  it('compares the level within one elite phase', () => {
    const out = potentials({
      potentialRanks: ranks,
      talents: [
        {
          candidates: [
            candidate('PHASE_0', 30, 0, 'b0'),
            candidate('PHASE_0', 1, 0, 'a0'),
            candidate('PHASE_0', 1, 4, 'a4'),
            candidate('PHASE_0', 30, 4, 'b4'),
          ],
        },
      ],
    })
    expect(out.char_017_huang.talents[0].candidates.map((c) => c.desc)).toEqual(['b0', 'b4'])
  })

  it('leaves out hidden talents and talents with one text', () => {
    const out = potentials({
      potentialRanks: ranks,
      talents: [
        {
          candidates: [
            candidate('PHASE_2', 1, 0, 'hidden'),
            candidate('PHASE_2', 1, 2, 'hidden', { isHideTalent: true }),
          ],
        },
        { candidates: [candidate('PHASE_1', 1, 0, 'once'), candidate('PHASE_2', 1, 0, 'once')] },
        { candidates: [candidate('PHASE_2', 1, 0, 'kept'), candidate('PHASE_2', 1, 4, 'kept')] },
      ],
    })
    expect(out.char_017_huang.talents.map((t) => t.candidates[0].desc)).toEqual(['kept'])
  })

  it('reads a talent without isHideTalent as shown', () => {
    const { isHideTalent: _, ...bare } = candidate('PHASE_2', 1, 0, 'x')
    const out = potentials({
      potentialRanks: ranks,
      talents: [{ candidates: [bare, { ...bare, requiredPotentialRank: 2 }] }],
    })
    expect(out.char_017_huang.talents).toHaveLength(1)
  })

  it('keeps the first of two texts for one potential', () => {
    const out = potentials({
      potentialRanks: ranks,
      talents: [
        {
          candidates: [
            candidate('PHASE_2', 1, 0, 'first'),
            candidate('PHASE_2', 1, 0, 'second'),
            candidate('PHASE_2', 1, 2, 'then'),
          ],
        },
      ],
    })
    expect(out.char_017_huang.talents[0].candidates.map((c) => c.desc)).toEqual(['first', 'then'])
  })

  it('writes an operator without potential with empty lists', () => {
    expect(potentials({ potentialRanks: [], talents: [] })).toEqual({ char_017_huang: { ranks: [], talents: [] } })
  })

  it("leaves out tokens and traps, and adds Amiya's other forms by their own ids", () => {
    const out = readPotentials(
      {
        char_002_amiya: { potentialRanks: [rank('部署费用-1')], talents: [] },
        token_10000_silent_healrb: { potentialRanks: {}, talents: null },
        trap_001_crate: { potentialRanks: {}, talents: null },
      },
      {
        infos: {},
        patchChars: { char_1001_amiya2: { potentialRanks: [rank('防御力+22')], talents: [] } },
      },
    )
    expect(Object.keys(out).sort()).toEqual(['char_002_amiya', 'char_1001_amiya2'])
    expect(out.char_1001_amiya2.ranks).toEqual(['防御力+22'])
  })

  it('reads {} and null lists as empty', () => {
    expect(potentials({ potentialRanks: {}, talents: {} })).toEqual({ char_017_huang: { ranks: [], talents: [] } })
    expect(potentials({ potentialRanks: null, talents: null })).toEqual({ char_017_huang: { ranks: [], talents: [] } })
    expect(potentials({ potentialRanks: ranks, talents: [{ candidates: null }, { candidates: {} }] })).toEqual({
      char_017_huang: { ranks: ranks.map((r) => r.description), talents: [] },
    })
  })

  it('reads a phase written as a number like its name', () => {
    const talent = (p: (n: number) => string | number) => ({
      potentialRanks: ranks,
      talents: [
        {
          candidates: [
            candidate(p(0), 1, 0, 'e0'),
            candidate(p(1), 1, 0, 'e1'),
            candidate(p(2), 1, 0, 'e2'),
            candidate(p(2), 1, 2, 'e2p'),
          ],
        },
      ],
    })
    const named = potentials(talent((n) => `PHASE_${n}`))
    expect(potentials(talent((n) => n))).toEqual(named)
    expect(named.char_017_huang.talents[0].candidates.map((c) => c.desc)).toEqual(['e2', 'e2p'])
  })

  it('writes a rank without a description as an empty string', () => {
    expect(potentials({ potentialRanks: [rank('部署费用-1'), rank(null)], talents: [] }).char_017_huang.ranks).toEqual([
      '部署费用-1',
      '',
    ])
  })

  it('gives what the details schema takes', () => {
    const out = potentials({
      potentialRanks: ranks,
      talents: [{ candidates: [candidate('PHASE_2', 1, 0, null, { name: null }), candidate('PHASE_2', 1, 2, 'x')] }],
    })
    expect(Details.shape.potentials.safeParse(out).success).toBe(true)
    expect(readPotentials({}, noPatches)).toEqual({})
  })
})
