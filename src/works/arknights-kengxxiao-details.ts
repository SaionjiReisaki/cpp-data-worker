import pProps from 'p-props'
import { ZodTypeAny, z } from 'zod'
import {
  Effect,
  localizeEffects,
  nounTables,
  parseBuff,
  regionNames,
  sameNumbers,
} from '../arknights-base-skill-effects.js'
import { buildData } from '../dc-utils.js'
import { unwrapZod } from '../zutils.js'
import { Lang, array, buildKengxxiaoVersion, fetchKengxxiaoExcel } from './arknights-kengxxiao.js'

// Skill, module and potential texts are kept out of arknights-kengxxiao: every page load downloads that one, and these
// are only read when a player opens a detail. The version is the same one, so the client can tell when this file lags.
export async function makeArknightsKengxxiaoDetails(lang: Lang) {
  const file = 'arknights-kengxxiao-details-' + lang

  await buildData(
    file,
    async () => {
      const [version, commit] = await buildKengxxiaoVersion(lang)
      // Bump it when the base skill rules change too: the containers are only rebuilt for a new version or schema.
      version.schema = 3
      if (lang === 'zh_CN') return [version, commit, commit] as const
      // Base skill effects are read from zh_CN's texts, so a newer zh_CN rebuilds this region's details as well.
      const [zhVersion, zhCommit] = await buildKengxxiaoVersion('zh_CN')
      version.sources.push(...zhVersion.sources)
      return [version, commit, zhCommit] as const
    },
    async (commit, zhCommit) => {
      const work = (table: string) => fetchKengxxiaoExcel(lang, commit, table)

      const local = await pProps({
        exSkills: work('skill_table'),
        exBattleEquips: work('battle_equip_table'),
        exConst: work('gamedata_const'),
        exBuilding: work('building_data'),
        exCharacters: work('character_table'),
        exPatchCharacters: work('char_patch_table'),
        exItems: work('item_table'),
        exUniEquips: work('uniequip_table'),
      })
      const zh =
        lang === 'zh_CN'
          ? local
          : await pProps({
              exConst: fetchKengxxiaoExcel('zh_CN', zhCommit, 'gamedata_const'),
              exBuilding: fetchKengxxiaoExcel('zh_CN', zhCommit, 'building_data'),
              exCharacters: fetchKengxxiaoExcel('zh_CN', zhCommit, 'character_table'),
              exItems: fetchKengxxiaoExcel('zh_CN', zhCommit, 'item_table'),
              exUniEquips: fetchKengxxiaoExcel('zh_CN', zhCommit, 'uniequip_table'),
            })

      const raw = unwrapZod(Source.safeParse(local))
      const potentials = readPotentials(local.exCharacters, local.exPatchCharacters)
      const changing = Object.values(potentials).reduce((n, p) => n + p.talents.length, 0)
      console.log(
        `potentials: ${Object.keys(potentials).length} operators, ${changing} talents that change with potential`,
      )
      const data = unwrapZod(
        Details.safeParse({
          ...transform(raw),
          buildingBuffs: buildingBuffs(lang, raw.exBuilding, local, zh),
          potentials,
        }),
      )
      return [data, Details]
    },
  )
}

type Tables = { exConst: any; exBuilding: any; exCharacters: any; exItems: any; exUniEquips: any }

// The texts are the region's own; the effects are parsed from zh_CN's text of the same skill and carry the region's
// names. A region whose text has other numbers than zh_CN's is on another version of the skill, and gets none.
function buildingBuffs(lang: Lang, building: z.output<typeof SourceBuilding>, local: Tables, zh: Tables) {
  const tables = nounTables({
    buildingData: zh.exBuilding,
    characterTable: zh.exCharacters,
    gamedataConst: zh.exConst,
    itemTable: zh.exItems,
    uniequipTable: zh.exUniEquips,
  })
  const names = regionNames({
    gamedataConst: local.exConst,
    characterTable: local.exCharacters,
    itemTable: local.exItems,
    uniequipTable: local.exUniEquips,
  })

  const out: z.input<typeof Details>['buildingBuffs'] = {}
  let summarised = 0
  const failures: string[] = []
  for (const char of Object.values(building.chars)) {
    for (const slot of char.buffChar) {
      for (const { buffId } of slot.buffData) {
        const buff = building.buffs[buffId]
        if (!buff || out[buffId]) continue
        out[buffId] = { text: buff.description }
        const zhText: string | undefined = zh.exBuilding.buffs[buffId]?.description
        if (zhText == null) continue
        const parsed = parseBuff(zhText, zh.exBuilding.buffs[buffId].roomType, tables)
        if ('failed' in parsed) {
          failures.push(`  ${buffId} ${buff.buffName}: ${parsed.failed}`)
          continue
        }
        if (lang !== 'zh_CN' && !sameNumbers(zhText, buff.description)) continue
        const effects = localizeEffects(parsed.effects, names)
        if (!effects) continue
        out[buffId].effects = effects
        summarised++
      }
    }
  }

  console.log(`base skills summarised: ${summarised} / ${Object.keys(out).length}`)
  if (lang === 'zh_CN') console.log(`base skills not summarised:\n${failures.join('\n')}`)
  return out
}

/** character_table and char_patch_table as fetched; returns Details['potentials'] */
export function readPotentials(characterTable: unknown, patchTable: unknown): z.input<typeof Details>['potentials'] {
  const tables = unwrapZod(
    z
      .object({
        characterTable: z.record(z.unknown()),
        patchTable: z.object({ patchChars: z.record(z.unknown()) }),
      })
      .safeParse({ characterTable, patchTable }),
  )
  // Tokens and traps share the table, and never have potentials of their own.
  const operators = Object.entries(tables.characterTable).filter(([charId]) => charId.startsWith('char_'))
  const source = unwrapZod(
    z
      .record(SourcePotentialCharacter)
      .safeParse(Object.fromEntries([...operators, ...Object.entries(tables.patchTable.patchChars)])),
  )

  const out: z.input<typeof Details>['potentials'] = {}
  for (const [charId, char] of Object.entries(source)) {
    out[charId] = {
      ranks: char.potentialRanks.map((rank) => rank.description ?? ''),
      talents: char.talents.flatMap(({ candidates }) => {
        if (candidates.some((c) => c.isHideTalent)) return []
        // Each elite phase and level the talent improves at repeats every potential's text: keep the highest.
        let top = candidates[0]?.unlockCondition
        for (const c of candidates) if (compareUnlock(c.unlockCondition, top) > 0) top = c.unlockCondition
        const kept: typeof candidates = []
        for (const c of candidates) {
          if (compareUnlock(c.unlockCondition, top) !== 0) continue
          if (kept.some((k) => k.requiredPotentialRank === c.requiredPotentialRank)) continue
          kept.push(c)
        }
        if (kept.length < 2) return []
        kept.sort((a, b) => a.requiredPotentialRank - b.requiredPotentialRank)
        return [
          {
            candidates: kept.map((c) => ({ potential: c.requiredPotentialRank, name: c.name, desc: c.description })),
          },
        ]
      }),
    }
  }
  return out
}

function compareUnlock(a: { phase: number; level: number }, b: { phase: number; level: number }) {
  return a.phase - b.phase || a.level - b.level
}

function transform(raw: z.output<typeof Source>): Omit<z.input<typeof Details>, 'buildingBuffs' | 'potentials'> {
  const skills: z.input<typeof Details>['skills'] = {}
  for (const [skillId, skill] of Object.entries(raw.exSkills)) {
    if (!skill.levels.length) continue
    const texts: string[] = []
    const first = skill.levels[0]
    skills[skillId] = {
      skillType: first.skillType,
      spType: first.spData.spType,
      durationType: first.durationType,
      texts,
      levels: skill.levels.map((level) => {
        const text = level.description ?? ''
        let index = texts.indexOf(text)
        if (index < 0) index = texts.push(text) - 1
        return {
          text: index,
          duration: level.duration,
          spCost: level.spData.spCost,
          initSp: level.spData.initSp,
          bb: blackboard(level.blackboard),
        }
      }),
    }
  }

  const equips: z.input<typeof Details>['equips'] = {}
  for (const [equipId, equip] of Object.entries(raw.exBattleEquips)) {
    if (!equip.phases.length) continue
    equips[equipId] = {
      phases: equip.phases.map((phase) => ({
        attr: blackboard(phase.attributeBlackboard),
        parts: phase.parts.map((part) => ({
          target: part.target,
          isToken: part.isToken,
          trait: (part.overrideTraitDataBundle.candidates ?? []).map((c) => ({
            add: c.additionalDescription,
            over: c.overrideDescripton,
            bb: blackboard(c.blackboard),
            potential: c.requiredPotentialRank,
          })),
          talent: (part.addOrOverrideTalentDataBundle.candidates ?? []).map((c) => ({
            name: c.name,
            upgrade: c.upgradeDescription,
            desc: c.description,
            bb: blackboard(c.blackboard),
            potential: c.requiredPotentialRank,
          })),
        })),
      })),
    }
  }

  const terms: z.input<typeof Details>['terms'] = {}
  for (const [termId, term] of Object.entries(raw.exConst.termDescriptionDict)) {
    terms[termId] = { name: term.termName, desc: term.description }
  }

  return { skills, equips, terms }
}

// An entry that only has valueStr names a range or a projectile; no description prints it.
function blackboard(bb: z.output<typeof SourceBlackboard>): [string, number][] {
  return bb.filter((x) => x.valueStr == null).map((x) => [x.key, x.value])
}

const SourceBlackboard = z.union([
  array(
    z.object({
      key: z.string(),
      value: z.number(),
      valueStr: z.union([z.string(), z.null()]).optional(),
    }),
  ),
  z.null().transform(() => []),
])

const text = z.union([z.string(), z.null()])

// Some fields are written as their enum number in one source and as the name in another; keep either as a string.
const enumLike = z.union([z.string(), z.number().transform(String)])

// A list the tables write as null when there is nothing in it, besides ArknightsAssets' {}.
function list<T extends ZodTypeAny>(item: T) {
  return z.union([array(item), z.null().transform((): z.output<T>[] => [])])
}

// ArknightsAssets writes a phase as its enum number.
const SourcePhase = z.union([
  z.enum(['PHASE_0', 'PHASE_1', 'PHASE_2']).transform((phase) => Number(phase.slice('PHASE_'.length))),
  z.number(),
])

const SourcePotentialCharacter = z.object({
  potentialRanks: list(z.object({ description: text })),
  talents: list(
    z.object({
      candidates: list(
        z.object({
          unlockCondition: z.object({ phase: SourcePhase, level: z.number() }),
          requiredPotentialRank: z.number(),
          name: text,
          description: text,
          isHideTalent: z.boolean().optional(),
        }),
      ),
    }),
  ),
})

const SourceBuilding = z.object({
  buffs: z.record(z.object({ buffName: z.string(), description: z.string() })),
  chars: z.record(
    z.object({
      buffChar: array(z.object({ buffData: array(z.object({ buffId: z.string() })) })),
    }),
  ),
})

const Source = z.object({
  exBuilding: SourceBuilding,
  exSkills: z.record(
    z.object({
      levels: array(
        z.object({
          description: text,
          skillType: enumLike,
          durationType: enumLike,
          spData: z.object({
            spType: enumLike,
            spCost: z.number(),
            initSp: z.number(),
          }),
          duration: z.number(),
          blackboard: SourceBlackboard,
        }),
      ),
    }),
  ),
  exBattleEquips: z.record(
    z.object({
      phases: array(
        z.object({
          attributeBlackboard: SourceBlackboard,
          parts: array(
            z.object({
              target: enumLike,
              isToken: z.boolean(),
              overrideTraitDataBundle: z.object({
                candidates: z.union([
                  array(
                    z.object({
                      additionalDescription: text,
                      overrideDescripton: text,
                      blackboard: SourceBlackboard,
                      requiredPotentialRank: z.number(),
                    }),
                  ),
                  z.null(),
                ]),
              }),
              addOrOverrideTalentDataBundle: z.object({
                candidates: z.union([
                  array(
                    z.object({
                      name: text,
                      upgradeDescription: text,
                      description: text,
                      blackboard: SourceBlackboard,
                      requiredPotentialRank: z.number(),
                    }),
                  ),
                  z.null(),
                ]),
              }),
            }),
          ),
        }),
      ),
    }),
  ),
  exConst: z.object({
    termDescriptionDict: z.record(
      z.object({
        termName: z.string(),
        description: z.string(),
      }),
    ),
  }),
})

const Blackboard = z.array(z.tuple([z.string(), z.number()]))

const PotentialTalentCandidate = z.object({
  // requiredPotentialRank: the potentialRank from which this text applies (0 is 潜能 1)
  potential: z.number(),
  name: text,
  desc: text,
})

export const Details = z.object({
  skills: z.record(
    z.object({
      skillType: z.string(),
      spType: z.string(),
      durationType: z.string(),
      texts: z.array(z.string()),
      levels: z.array(
        z.object({
          text: z.number(),
          duration: z.number(),
          spCost: z.number(),
          initSp: z.number(),
          bb: Blackboard,
        }),
      ),
    }),
  ),
  equips: z.record(
    z.object({
      phases: z.array(
        z.object({
          attr: Blackboard,
          parts: z.array(
            z.object({
              target: z.string(),
              isToken: z.boolean(),
              trait: z.array(
                z.object({
                  add: text,
                  over: text,
                  bb: Blackboard,
                  potential: z.number(),
                }),
              ),
              talent: z.array(
                z.object({
                  name: text,
                  upgrade: text,
                  desc: text,
                  bb: Blackboard,
                  potential: z.number(),
                }),
              ),
            }),
          ),
        }),
      ),
    }),
  ),
  terms: z.record(
    z.object({
      name: z.string(),
      desc: z.string(),
    }),
  ),
  buildingBuffs: z.record(
    z.object({
      // The region's text, with the game's rich text tags
      text: z.string(),
      // Absent when the skill could not be summarised for this region
      effects: z.array(Effect).optional(),
    }),
  ),
  // Keyed by charId, Amiya's other forms (char_patch_table's patchChars) by their own ids
  potentials: z.record(
    z.object({
      // 潜能 2 to 潜能 6; empty for an operator without potential
      ranks: z.array(z.string()),
      // Talents that change with potential, at the highest elite and level they unlock at, without hidden talents
      talents: z.array(
        z.object({
          // At least two, by potential ascending
          candidates: z.array(PotentialTalentCandidate),
        }),
      ),
    }),
  ),
})
