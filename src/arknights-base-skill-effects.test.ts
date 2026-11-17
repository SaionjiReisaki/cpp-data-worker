/* oxlint-disable unicorn/no-thenable */
import { describe, expect, it } from 'vitest'
import {
  type Effect,
  type NounTables,
  localizeEffects,
  nounTables,
  parseBuff,
  regionNames,
  sameNumbers,
} from './arknights-base-skill-effects.js'

const tables: NounTables = {
  terms: new Map([
    ['莱茵生命', 'cc.g.rh'],
    ['工作场所', 'cc.c.room3'],
  ]),
  chars: new Map([
    ['拉普兰德', 'char_140_whitew'],
    ['乌尔比安', 'char_4145_ulpia'],
    ['伊内丝', 'char_4087_ines'],
    ['W', 'char_113_cqbw'],
    ['能天使', 'char_103_angel'],
  ]),
  rooms: new Map([
    ['制造站', 'MANUFACTURE'],
    ['贸易站', 'TRADING'],
    ['发电站', 'POWER'],
    ['宿舍', 'DORMITORY'],
    ['会客室', 'MEETING'],
    ['控制中枢', 'CONTROL'],
  ]),
  items: new Map([['异铁', '30042']]),
  branches: new Map([['驭法铁卫', 'artsprotector']]),
}

const SEES = { ref: 'term:cc.tag.sees', text: 'S.E.E.S.' }
const LAPPLAND = { ref: 'char:char_140_whitew', text: '拉普兰德' }
const INES_AND_W =
  '进驻贸易站时，订单获取效率<@cc.vup>+30%</>；当<@cc.kw>伊内丝</>、<@cc.kw>W</>入驻<$cc.c.room3><@cc.kw>工作场所</></>时（不包含副手），订单获取效率分别额外<@cc.vup>+5%</>'

function effects(description: string, roomType: string, t = tables): Effect[] {
  const r = parseBuff(description, roomType, t)
  if (!('effects' in r)) throw new Error('failed: ' + r.failed)
  return r.effects
}

describe('parseBuff', () => {
  describe('flat numbers', () => {
    it('reads one number on the room metric', () => {
      expect(effects('进驻制造站时，生产力<@cc.vup>+15%</>', 'MANUFACTURE')).toEqual([{ k: 'flat', m: 'prod', v: 15 }])
    })

    it('reads several numbers, with their signs', () => {
      expect(
        effects(
          '进驻制造站时，生产力<@cc.vup>+25%</>，仓库容量上限<@cc.vdown>-12</>，心情每小时消耗<@cc.vdown>+0.25</>',
          'MANUFACTURE',
        ),
      ).toEqual([
        { k: 'flat', m: 'prod', v: 25 },
        { k: 'flat', m: 'cap', v: -12 },
        { k: 'flat', m: 'cost', v: 0.25 },
      ])
    })

    it('keeps the recipe class a number is for', () => {
      expect(effects('进驻制造站时，<@cc.kw>作战记录</>类配方的生产力<@cc.vup>+35%</>', 'MANUFACTURE')).toEqual([
        { k: 'flat', m: 'prod', v: 35, of: [{ word: 'exp' }] },
      ])
    })

    it('keeps who a number goes to', () => {
      expect(
        effects(
          '进驻宿舍时，使该宿舍内除自身以外心情未满的某个干员每小时恢复<@cc.vup>+0.2</>（同种效果取最高）；同时自身心情每小时恢复<@cc.vup>+0.4</>',
          'DORMITORY',
        ),
      ).toEqual([
        { k: 'flat', m: 'recover', v: 0.2, to: 'one' },
        { k: 'flat', m: 'recover', v: 0.4, to: 'self' },
      ])
      expect(effects('进驻控制中枢时，所有制造站生产力<@cc.vup>+2%</>（同种效果取最高）', 'CONTROL')).toEqual([
        { k: 'flat', m: 'prod', v: 2, to: { all: 'MANUFACTURE' } },
      ])
    })
  })

  describe('numbers per count', () => {
    it('reads a header and the number after it, with a cap on the count', () => {
      expect(
        effects(
          '进驻制造站时，生产力<@cc.vup>+20%</>，基建内（不包含副手）每有1名<$cc.tag.sees><@cc.kw>S.E.E.S.</></>干员（最多<@cc.kw>4</>名），生产力额外<@cc.vup>+5%</>',
          'MANUFACTURE',
        ),
      ).toEqual([
        { k: 'flat', m: 'prod', v: 20 },
        { k: 'per', m: 'prod', v: 5, each: { n: 1, unit: 'op', what: [SEES] }, maxCount: 4 },
      ])
    })

    it('reads a per-level number with a cap on the value', () => {
      expect(
        effects(
          '进驻贸易站时，订单获取效率<@cc.vup>+25%</>，会客室每级额外提供<@cc.vup>5%</>获取效率，最多提供<@cc.vup>40%</>效率',
          'TRADING',
        ),
      ).toEqual([
        { k: 'flat', m: 'order', v: 25 },
        { k: 'per', m: 'order', v: 5, each: { n: 1, unit: 'level', what: [{ room: 'MEETING' }] }, maxValue: 40 },
      ])
    })
  })

  describe('conditions', () => {
    it('wraps the whole skill when it opens with a condition', () => {
      expect(
        effects(
          '当与<@cc.kw>拉普兰德</>在同一个贸易站时，心情每小时消耗<@cc.vdown>+0.3</>，订单获取效率<@cc.vup>+65%</>',
          'TRADING',
        ),
      ).toEqual([
        {
          k: 'if',
          when: { c: 'with', who: [LAPPLAND], group: false },
          then: [
            { k: 'flat', m: 'cost', v: 0.3 },
            { k: 'flat', m: 'order', v: 65 },
          ],
        },
      ])
    })

    it('reads a condition in the middle', () => {
      expect(
        effects(
          '进驻贸易站时，订单获取效率<@cc.vup>+25%</>；当<@cc.kw>乌尔比安</>在基建内时（不包含副手及活动室使用者），订单获取效率额外<@cc.vup>+5%</>',
          'TRADING',
        ),
      ).toEqual([
        { k: 'flat', m: 'order', v: 25 },
        {
          k: 'if',
          when: { c: 'at', who: [{ ref: 'char:char_4145_ulpia', text: '乌尔比安' }], where: 'base' },
          then: [{ k: 'flat', m: 'order', v: 5 }],
        },
      ])
    })

    it('reads a workshop recipe mood cost as a condition', () => {
      expect(
        effects(
          '进驻加工站加工<@cc.kw>精英材料</>时，心情消耗为<@cc.kw>4</>的配方全部<@cc.vup>-1</>心情消耗',
          'WORKSHOP',
        ),
      ).toEqual([
        {
          k: 'if',
          when: { c: 'recipeMood', v: 4 },
          then: [{ k: 'flat', m: 'cost', v: -1, of: [{ word: 'eliteMaterial' }] }],
        },
      ])
    })
  })

  describe('numbers that grow with time', () => {
    it('reads a first hour, a step and an end', () => {
      expect(
        effects(
          '进驻制造站后，生产力首小时<@cc.vup>+20%</>，此后每小时<@cc.vup>+1%</>，最终达到<@cc.vup>+25%</>',
          'MANUFACTURE',
        ),
      ).toEqual([{ k: 'ramp', m: 'prod', v0: 20, v1: 25 }])
    })

    it('reads a ramp that starts at zero', () => {
      expect(effects('进驻制造站后，生产力每小时<@cc.vup>+2%</>，最终达到<@cc.vup>+20%</>', 'MANUFACTURE')).toEqual([
        { k: 'ramp', m: 'prod', v0: 0, v1: 20 },
      ])
    })
  })

  it('reads a zeroing, and a room as what is counted', () => {
    expect(
      effects(
        '进驻制造站时，当前制造站内其他干员提供的生产力<@cc.vdown>全部归零</>（不包含根据设施数量提供加成的生产力），每个<@cc.kw>发电站</>为当前制造站<@cc.vup>+5%</>的生产力',
        'MANUFACTURE',
      ),
    ).toEqual([
      { k: 'zero', m: 'prod' },
      { k: 'per', m: 'prod', v: 5, each: { n: 1, unit: 'room', what: [{ room: 'POWER' }] } },
    ])
  })

  it('reads a resource and a conversion', () => {
    const info = { ref: 'term:cc.bd_a1', text: '感知信息' }
    expect(
      effects(
        '进驻制造站时，宿舍内每有<@cc.kw>1</>名干员则<$cc.bd_a1><@cc.rem>感知信息</></><@cc.vup>+1</>，同时每<@cc.vup>1</>点<$cc.bd_a1><@cc.rem>感知信息</></>转化为<@cc.vup>1</>点<$cc.bd_A><@cc.rem>思维链环</></>',
        'MANUFACTURE',
      ),
    ).toEqual([
      { k: 'res', what: info, v: 1, each: { n: 1, unit: 'op', what: [{ room: 'DORMITORY' }] } },
      { k: 'conv', from: info, fromN: 1, to: { ref: 'term:cc.bd_A', text: '思维链环' }, toN: 1 },
    ])
  })

  it('reads a note', () => {
    expect(
      effects(
        '进驻贸易站时，订单获取效率<@cc.vup>+10%</>，固定获取<$cc.tra.closure><@cc.kw>可露希尔特别订单</></>（不视作违约订单）',
        'TRADING',
      ),
    ).toEqual([
      { k: 'flat', m: 'order', v: 10 },
      { k: 'note', note: 'fixedOrder', what: [{ ref: 'term:cc.tra.closure', text: '可露希尔特别订单' }] },
    ])
  })

  describe('nouns', () => {
    it('takes a term from its markup before any table', () => {
      expect(
        effects(
          '进驻贸易站时，订单获取效率<@cc.vup>+20%</>；当与<@cc.kw><$cc.angel>能天使</></>在同一个贸易站时，订单获取效率额外<@cc.vup>+25%</>',
          'TRADING',
        )[1],
      ).toEqual({
        k: 'if',
        when: { c: 'with', who: [{ ref: 'term:cc.angel', text: '能天使' }], group: false },
        then: [{ k: 'flat', m: 'order', v: 25 }],
      })
    })

    it('finds a term by its name', () => {
      expect(
        effects(
          '进驻会客室时，线索搜集速度提升<@cc.vup>10%</>，且更容易获得<@cc.kw>莱茵生命</>线索（工作时长影响概率）',
          'MEETING',
        ),
      ).toEqual([
        { k: 'flat', m: 'clue', v: 10 },
        { k: 'note', note: 'clueOf', what: [{ ref: 'term:cc.g.rh', text: '莱茵生命' }] },
      ])
    })

    it('finds an item and a profession', () => {
      expect(effects('进驻加工站加工<@cc.kw>异铁</>类材料时，副产品的产出概率提升<@cc.vup>90%</>', 'WORKSHOP')).toEqual(
        [{ k: 'flat', m: 'byprod', v: 90, of: [{ ref: 'item:30042', text: '异铁' }] }],
      )
      expect(effects('进驻训练室协助位时，<@cc.kw>近卫</>干员的专精技能训练速度<@cc.vup>+30%</>', 'TRAINING')).toEqual([
        { k: 'flat', m: 'train', v: 30, of: [{ word: 'prof.WARRIOR' }] },
      ])
    })

    it('finds a branch', () => {
      expect(
        effects(
          '进驻训练室协助位时，<@cc.kw>重装</>干员的专精技能训练速度<@cc.vup>+30%</>，如果训练位干员分支为<@cc.kw>驭法铁卫</>，则训练速度额外<@cc.vup>+45%</>',
          'TRAINING',
        ),
      ).toEqual([
        { k: 'flat', m: 'train', v: 30, of: [{ word: 'prof.TANK' }] },
        {
          k: 'if',
          when: { c: 'trainee', who: [{ ref: 'branch:artsprotector', text: '驭法铁卫' }] },
          then: [{ k: 'flat', m: 'train', v: 45 }],
        },
      ])
    })

    it('splits nouns joined by 与 and by 、', () => {
      expect(
        effects(
          '进驻训练室协助位时，<@cc.kw>近卫</>与<@cc.kw>狙击</>干员的专精技能训练速度<@cc.vup>+30%</>',
          'TRAINING',
        ),
      ).toEqual([{ k: 'flat', m: 'train', v: 30, of: [{ word: 'prof.WARRIOR' }, { word: 'prof.SNIPER' }] }])
      expect(effects(INES_AND_W, 'TRADING')[1]).toEqual({
        k: 'per',
        m: 'order',
        v: 5,
        each: {
          n: 1,
          unit: 'op',
          what: [
            { ref: 'char:char_4087_ines', text: '伊内丝' },
            { ref: 'char:char_113_cqbw', text: 'W' },
          ],
        },
      })
    })

    it('fails the whole skill when one of the nouns is missing', () => {
      const chars = new Map(tables.chars)
      chars.delete('W')
      expect(parseBuff(INES_AND_W, 'TRADING', { ...tables, chars })).toEqual({ failed: '当伊内丝、W入驻工作场所时' })
    })
  })

  it('fails the whole skill at the first clause it cannot read', () => {
    expect(
      parseBuff('进驻制造站时，当前制造站内干员提升的每格仓库容量，提供<@cc.vup>2%</>生产力', 'MANUFACTURE', tables),
    ).toEqual({ failed: '当前制造站内干员提升的每格仓库容量' })
  })
})

describe('nounTables', () => {
  it('keeps only term names no other term shares, and only playable characters', () => {
    const t = nounTables({
      buildingData: { rooms: { MANUFACTURE: { name: '制造站' }, HIRE: { name: '办公室' } } },
      characterTable: {
        char_002_amiya: { name: '阿米娅' },
        trap_627_xb2amy: { name: '阿米娅' },
        token_x: { name: 'X' },
      },
      gamedataConst: {
        termDescriptionDict: {
          'cc.g.rh': { termName: '莱茵生命' },
          'cc.a': { termName: '特殊加成' },
          'cc.b': { termName: '特殊加成' },
        },
      },
      itemTable: { items: { '30042': { name: '异铁' } } },
      uniequipTable: { subProfDict: { artsprotector: { subProfessionName: '驭法铁卫' } } },
    })
    expect([...t.terms]).toEqual([['莱茵生命', 'cc.g.rh']])
    expect([...t.chars]).toEqual([['阿米娅', 'char_002_amiya']])
    expect(t.rooms.get('人力办公室')).toBe('HIRE')
    expect(t.rooms.get('制造站')).toBe('MANUFACTURE')
    expect(t.items.get('异铁')).toBe('30042')
    expect(t.branches.get('驭法铁卫')).toBe('artsprotector')
  })
})

describe('sameNumbers', () => {
  const zh = '进驻制造站时，生产力<@cc.vup>+25%</>，仓库容量上限<@cc.vdown>-12</>，心情每小时消耗<@cc.vdown>+0.25</>'

  it('matches texts with the same numbers', () => {
    expect(
      sameNumbers(
        zh,
        'When this Operator is assigned to a Factory, productivity <@cc.vup>+25%</>, capacity limit <@cc.vdown>-12</>, and Morale consumed per hour <@cc.vdown>+0.25</>',
      ),
    ).toBe(true)
  })

  it('rejects a text with a number missing', () => {
    expect(sameNumbers(zh, 'productivity +25%, Morale consumed per hour +0.25')).toBe(false)
  })

  it('rejects a text with a different number', () => {
    expect(sameNumbers(zh, 'productivity +25%, capacity limit -10, Morale consumed per hour +0.25')).toBe(false)
  })

  it('reads full-width digits as their narrow forms', () => {
    expect(sameNumbers('生产力<@cc.vup>+15%</>', '生産力<@cc.vup>＋１５％</>')).toBe(true)
  })

  it('counts neither the order nor 0 and 1', () => {
    expect(
      sameNumbers(
        '进驻发电站时，每<@cc.vup>10</>架无人机上限<@cc.vup>+1%</>无人机充能速度（最多<@cc.vup>+25%</>）',
        'When this Operator is assigned to a Power Plant, <@cc.vup>+1%</> Drone recovery rate for every <@cc.vup>10</> max Drone capacity (Max <@cc.vup>+25%</>)',
      ),
    ).toBe(true)
    expect(
      sameNumbers(
        '进驻控制中枢时，控制中枢内所有干员的心情每小时恢复<@cc.vup>+0.05</>',
        '制御中枢配置時、制御中枢内全員の体力が1時間ごとに<@cc.vup>+0.05</>回復',
      ),
    ).toBe(true)
    expect(
      sameNumbers('生产力<@cc.vdown>全部归零</>，每个发电站<@cc.vup>+5%</>', '製造効率を０にする。1か所につき+5%'),
    ).toBe(true)
  })
})

describe('localizeEffects', () => {
  const zh: Effect[] = [
    { k: 'flat', m: 'byprod', v: 90, of: [{ ref: 'item:30042', text: '异铁' }] },
    {
      k: 'if',
      when: { c: 'with', who: [LAPPLAND], group: false },
      then: [{ k: 'per', m: 'prod', v: 5, each: { n: 1, unit: 'op', what: [SEES, { room: 'MANUFACTURE' }] } }],
    },
    {
      k: 'if',
      when: { c: 'trainee', who: [{ ref: 'branch:artsprotector', text: '驭法铁卫' }] },
      then: [{ k: 'flat', m: 'train', v: 45, of: [{ word: 'prof.TANK' }] }],
    },
  ]
  const en = regionNames({
    gamedataConst: { termDescriptionDict: { 'cc.tag.sees': { termName: 'S.E.E.S.' } } },
    characterTable: { char_140_whitew: { name: 'Lappland' } },
    itemTable: { items: { '30042': { name: 'Oriron' } } },
    uniequipTable: { subProfDict: { artsprotector: { subProfessionName: 'Arts Protector' } } },
  })

  it("swaps every name for the region's, and leaves rooms and words alone", () => {
    expect(localizeEffects(zh, en)).toEqual([
      { k: 'flat', m: 'byprod', v: 90, of: [{ ref: 'item:30042', text: 'Oriron' }] },
      {
        k: 'if',
        when: { c: 'with', who: [{ ref: 'char:char_140_whitew', text: 'Lappland' }], group: false },
        then: [{ k: 'per', m: 'prod', v: 5, each: { n: 1, unit: 'op', what: [SEES, { room: 'MANUFACTURE' }] } }],
      },
      {
        k: 'if',
        when: { c: 'trainee', who: [{ ref: 'branch:artsprotector', text: 'Arts Protector' }] },
        then: [{ k: 'flat', m: 'train', v: 45, of: [{ word: 'prof.TANK' }] }],
      },
    ])
  })

  it('gives null when the region lacks one of the names', () => {
    const noLappland = { ...en, char: () => undefined }
    expect(localizeEffects(zh, noLappland)).toBeNull()
  })
})
