import pProps from 'p-props'
import { z } from 'zod'
import { buildData } from '../dc-utils.js'
import { unwrapZod } from '../zutils.js'
import { Lang, array, buildKengxxiaoVersion, fetchKengxxiaoExcel } from './arknights-kengxxiao.js'

// Skill and module texts are kept out of arknights-kengxxiao: every page load downloads that one, and these are only
// read when a player opens a detail. The version is the same one, so the client can tell when this file lags.
export async function makeArknightsKengxxiaoDetails(lang: Lang) {
  const file = 'arknights-kengxxiao-details-' + lang

  await buildData(
    file,
    async () => {
      const [version, commit] = await buildKengxxiaoVersion(lang)
      version.schema = 1
      return [version, commit]
    },
    async (commit) => {
      const work = (table: string) => fetchKengxxiaoExcel(lang, commit, table)

      const raw = unwrapZod(
        Source.safeParse(
          await pProps({
            exSkills: work('skill_table'),
            exBattleEquips: work('battle_equip_table'),
            exConst: work('gamedata_const'),
          }),
        ),
      )

      const data = unwrapZod(Details.safeParse(transform(raw)))
      return [data, Details]
    },
  )
}

function transform(raw: z.output<typeof Source>): z.input<typeof Details> {
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

const Source = z.object({
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

const Details = z.object({
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
})
