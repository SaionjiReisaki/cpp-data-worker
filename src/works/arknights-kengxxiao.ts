import pProps from 'p-props'
import { z } from 'zod'
import { buildData, dataContainerVersionFromGitCommit } from '../dc-utils.js'
import { fetchGitHubFile, getGitHubLatestCommitForPath } from '../github.js'
import { unwrapZod, zodTransformUnion } from '../zutils.js'

export async function makeArknightsKengxxiao(lang: 'zh_CN' | 'en_US' | 'ja_JP' | 'ko_KR') {
  const file = 'arknights-kengxxiao-' + lang
  const repo = lang === 'zh_CN' ? 'Kengxxiao/ArknightsGameData' : 'Kengxxiao/ArknightsGameData_YoStar'
  const branch = lang === 'zh_CN' ? 'master' : 'main'

  await buildData(
    file,
    async () => {
      const commit = await getGitHubLatestCommitForPath(repo, branch, lang)
      const version = dataContainerVersionFromGitCommit(repo, commit)
      version.text = commit.commit.message
      version.schema = 3
      return [version, commit]
    },
    async (commit) => {
      const work = async function (p: string) {
        const r = await fetchGitHubFile(repo, commit.sha, p)
        return JSON.parse(Buffer.from(r).toString('utf-8'))
      }

      const raw = await pProps({
        exCharacters: work(lang + '/gamedata/excel/character_table.json'),
        exPatchCharacters: work(lang + '/gamedata/excel/char_patch_table.json'),
        exSkin: work(lang + '/gamedata/excel/skin_table.json'),
        exSkills: work(lang + '/gamedata/excel/skill_table.json'),
        exUniEquips: work(lang + '/gamedata/excel/uniequip_table.json'),
        exItems: work(lang + '/gamedata/excel/item_table.json'),
        exBuilding: work(lang + '/gamedata/excel/building_data.json'),
        exStage: work(lang + '/gamedata/excel/stage_table.json'),
        exRetro: work(lang + '/gamedata/excel/retro_table.json'),
        exZone: work(lang + '/gamedata/excel/zone_table.json'),
      })

      const data = unwrapZod(ArknightsKengxxiao.safeParse(raw))
      return [data, ArknightsKengxxiao]
    },
  )
}

const phase = zodTransformUnion(
  z.enum(['PHASE_0', 'PHASE_1', 'PHASE_2']),
  z.literal(0).transform(() => 'PHASE_0'),
  z.literal(1).transform(() => 'PHASE_1'),
  z.literal(2).transform(() => 'PHASE_2'),
)

const rarity = zodTransformUnion(
  z.enum(['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'TIER_5', 'TIER_6']),
  z.literal(0).transform(() => 'TIER_1'),
  z.literal(1).transform(() => 'TIER_2'),
  z.literal(2).transform(() => 'TIER_3'),
  z.literal(3).transform(() => 'TIER_4'),
  z.literal(4).transform(() => 'TIER_5'),
  z.literal(5).transform(() => 'TIER_6'),
)

const levelUpCost = z.object({
  id: z.string(),
  count: z.number(),
  type: z.enum(['MATERIAL', 'GOLD']),
})

const unlockCond = z.object({ phase: phase, level: z.number() })

const character = {
  name: z.string(),
  description: z.union([z.string(), z.null()]),
  displayNumber: z.union([z.string(), z.null()]),
  appellation: z.string(),
  profession: z.enum([
    'CASTER',
    'MEDIC',
    'PIONEER',
    'SNIPER',
    'SPECIAL',
    'SUPPORT',
    'TANK',
    'WARRIOR',
    'TRAP',
    'TOKEN',
  ]),
  rarity: rarity,
  skills: z.array(
    z.object({
      skillId: z.union([z.string(), z.null()]),
      levelUpCostCond: z
        .array(
          z.object({
            unlockCond: unlockCond,
            lvlUpTime: z.number(),
            levelUpCost: z.union([z.array(levelUpCost), z.null()]),
          }),
        )
        .optional(),
    }),
  ),
  allSkillLvlup: z.array(
    z.object({
      unlockCond: unlockCond,
      lvlUpCost: z.union([z.array(levelUpCost), z.null()]),
    }),
  ),
  phases: z.array(
    z.object({
      maxLevel: z.number(),
      evolveCost: z.union([z.array(levelUpCost), z.null()]),
    }),
  ),
}

const stage = z.object({
  stageId: z.string(),
  zoneId: z.string(),
  code: z.string(),
  name: z.union([z.string(), z.null()]),
  difficulty: z.enum(['NORMAL', 'FOUR_STAR', 'SIX_STAR']),
  diffGroup: z.enum(['NONE', 'EASY', 'NORMAL', 'TOUGH', 'ALL']),
  apCost: z.number(),
})

export const ArknightsKengxxiao = z.object({
  exCharacters: z.record(z.object(character)),
  exPatchCharacters: z.object({
    infos: z.record(
      z.object({
        tmplIds: z.array(z.string()),
        default: z.string(),
      }),
    ),
    patchChars: z.record(z.object(character)),
  }),
  exSkin: z.object({
    buildinEvolveMap: z.record(z.record(z.string())),
    buildinPatchMap: z.record(z.record(z.string())),
  }),
  exSkills: z.record(
    z.object({
      skillId: z.string(),
      iconId: z.union([z.string(), z.null()]),
      levels: z.array(
        z.object({
          name: z.string(),
        }),
      ),
    }),
  ),
  exUniEquips: z.object({
    equipDict: z.record(
      z.object({
        uniEquipId: z.string(),
        charId: z.string(),
        unlockEvolvePhase: phase,
        typeName1: z.string(),
        typeName2: z.union([z.string(), z.null()]),
        uniEquipName: z.string(),
        equipShiningColor: z.string(),
        charEquipOrder: z.number(),
        typeIcon: z.string(),
        itemCost: z.union([z.record(z.array(levelUpCost)), z.null()]),
      }),
    ),
    charEquip: z.record(z.array(z.string())),
  }),
  exItems: z.object({
    items: z.record(
      z.object({
        itemId: z.string(),
        iconId: z.string(),
        name: z.string(),
        // description: z.union([z.string(), z.null()]),
        // usage: z.union([z.string(), z.null()]),
        rarity: rarity,
        sortId: z.number(),
        itemType: z.union([z.string(), z.number()]),
        classifyType: z.string(),
      }),
    ),
    expItems: z.record(
      z.object({
        id: z.string(),
        gainExp: z.number(),
      }),
    ),
  }),
  exBuilding: z.object({
    workshopFormulas: z.record(
      z.object({
        sortId: z.number(),
        formulaId: z.string(),
        itemId: z.string(),
        count: z.number(),
        goldCost: z.number(),
        apCost: z.number(),
        formulaType: z.enum(['F_BUILDING', 'F_ASC', 'F_EVOLVE', 'F_SKILL']),
        extraOutcomeRate: z.number(),
        extraOutcomeGroup: z.array(
          z.object({
            weight: z.number(),
            itemId: z.string(),
            itemCount: z.number(),
          }),
        ),
        costs: z.array(levelUpCost),
      }),
    ),
    manufactFormulas: z.record(
      z.object({
        formulaId: z.string(),
        itemId: z.string(),
        count: z.number(),
        costs: z.array(levelUpCost),
        formulaType: z.enum(['F_EXP', 'F_ASC', 'F_GOLD', 'F_DIAMOND']),
      }),
    ),
  }),
  exStage: z.object({
    stages: z.record(stage),
  }),
  exRetro: z.object({
    zoneToRetro: z.record(z.string()),
    retroActList: z.record(
      z.object({
        retroId: z.string(),
        index: z.number(),
        name: z.string(),
      }),
    ),
    stageList: z.record(stage),
  }),
  exZone: z.object({
    zones: z.record(
      z.object({
        zoneID: z.string(),
        zoneIndex: z.number(),
        zoneNameFirst: z.union([z.string(), z.null()]),
        zoneNameSecond: z.union([z.string(), z.null()]),
        type: z.enum([
          'MAINLINE',
          'WEEKLY',
          'CAMPAIGN',
          'CLIMB_TOWER',
          'ACTIVITY',
          'SIDESTORY',
          'GUIDE',
          'ROGUELIKE',
          'BRANCHLINE',
          'MAINLINE_ACTIVITY',
          'MAINLINE_RETRO',
        ]),
      }),
    ),
  }),
})
