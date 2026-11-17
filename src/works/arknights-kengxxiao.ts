import pProps from 'p-props'
import { ZodTypeAny, z } from 'zod'
import { buildData, dataContainerVersionFromGitCommit } from '../dc-utils.js'
import { fetchGitHubFile, getGitHubLatestCommitForPath } from '../github.js'
import { unwrapZod, zodTransformUnion } from '../zutils.js'

export type Lang = 'zh_CN' | 'en_US' | 'ja_JP' | 'ko_KR'

// Kengxxiao/ArknightsGameData_YoStar was archived on 2025-11-13, so the global servers come from
// ArknightsAssets/ArknightsGamedata, which lays out the same excel tables under its own region names.
const sources: Record<Lang, { repo: string; branch: string; dir: string }> = {
  zh_CN: { repo: 'Kengxxiao/ArknightsGameData', branch: 'master', dir: 'zh_CN' },
  en_US: { repo: 'ArknightsAssets/ArknightsGamedata', branch: 'master', dir: 'en' },
  ja_JP: { repo: 'ArknightsAssets/ArknightsGamedata', branch: 'master', dir: 'jp' },
  ko_KR: { repo: 'ArknightsAssets/ArknightsGamedata', branch: 'master', dir: 'kr' },
}

/** Every container built from one region's game data carries this version: the client compares them by version.id. */
export async function buildKengxxiaoVersion(lang: Lang) {
  const { repo, branch, dir } = sources[lang]
  const commit = await getGitHubLatestCommitForPath(repo, branch, dir)
  const version = dataContainerVersionFromGitCommit(repo, commit)
  version.text = commit.commit.message
  if (repo !== 'Kengxxiao/ArknightsGameData') {
    // Its commit messages list every region updated in one run ("Arknights update cn,jp,kr,tw"),
    // which says nothing about this region's game version.
    const dataVersion = Buffer.from(
      await fetchGitHubFile(repo, commit.sha, dir + '/gamedata/excel/data_version.txt'),
    ).toString('utf-8')
    version.text = dataVersion.match(/^VersionControl:(.+)$/m)?.[1]?.trim() ?? version.text
  }
  return [version, commit] as const
}

export async function fetchKengxxiaoExcel(lang: Lang, commit: { sha: string }, table: string) {
  const { repo, dir } = sources[lang]
  const r = await fetchGitHubFile(repo, commit.sha, `${dir}/gamedata/excel/${table}.json`)
  return JSON.parse(Buffer.from(r).toString('utf-8'))
}

export async function makeArknightsKengxxiao(lang: Lang) {
  const file = 'arknights-kengxxiao-' + lang

  await buildData(
    file,
    async () => {
      const [version, commit] = await buildKengxxiaoVersion(lang)
      version.schema = 4
      return [version, commit]
    },
    async (commit) => {
      const work = (table: string) => fetchKengxxiaoExcel(lang, commit, table)

      const raw = await pProps({
        exCharacters: work('character_table'),
        exPatchCharacters: work('char_patch_table'),
        exSkin: work('skin_table'),
        exSkills: work('skill_table'),
        exUniEquips: work('uniequip_table'),
        exItems: work('item_table'),
        exBuilding: work('building_data'),
        exStage: work('stage_table'),
        exRetro: work('retro_table'),
        exZone: work('zone_table'),
        exEnemies: work('enemy_handbook_table'),
      })

      const data = unwrapZod(ArknightsKengxxiao.safeParse(raw))
      return [data, ArknightsKengxxiao]
    },
  )
}

// ArknightsAssets dumps an empty array as {}; read it back as [] so both sources give the same data.
export function array<T extends ZodTypeAny>(item: T) {
  return z.preprocess(
    (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0 ? [] : v),
    z.array(item),
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
  position: z.enum(['MELEE', 'RANGED', 'ALL', 'NONE']),
  rarity: rarity,
  skills: array(
    z.object({
      skillId: z.union([z.string(), z.null()]),
      levelUpCostCond: array(
        z.object({
          unlockCond: unlockCond,
          lvlUpTime: z.number(),
          levelUpCost: z.union([array(levelUpCost), z.null()]),
        }),
      ).optional(),
    }),
  ),
  allSkillLvlup: array(
    z.object({
      unlockCond: unlockCond,
      lvlUpCost: z.union([array(levelUpCost), z.null()]),
    }),
  ),
  phases: array(
    z.object({
      maxLevel: z.number(),
      evolveCost: z.union([array(levelUpCost), z.null()]),
    }),
  ),
}

const stage = z.object({
  stageId: z.string(),
  zoneId: z.string(),
  code: z.union([z.string(), z.null()]),
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
        tmplIds: array(z.string()),
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
      levels: array(
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
        itemCost: z.union([z.record(array(levelUpCost)), z.null()]),
        tmplId: z.union([z.string(), z.null()]),
        missionList: array(z.string()),
      }),
    ),
    missionList: z.record(
      z.object({
        template: z.string(),
        desc: z.string(),
        paramList: array(z.string()),
        uniEquipId: z.string(),
        uniEquipMissionSort: z.number(),
        jumpStageId: z.union([z.string(), z.null()]),
      }),
    ),
    charEquip: z.record(array(z.string())),
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
        extraOutcomeGroup: array(
          z.object({
            weight: z.number(),
            itemId: z.string(),
            itemCount: z.number(),
          }),
        ),
        costs: array(levelUpCost),
      }),
    ),
    manufactFormulas: z.record(
      z.object({
        formulaId: z.string(),
        itemId: z.string(),
        count: z.number(),
        costs: array(levelUpCost),
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
  exEnemies: z.object({
    enemyData: z.record(
      z.object({
        name: z.string(),
        enemyLevel: z.enum(['NORMAL', 'ELITE', 'BOSS']),
      }),
    ),
  }),
})
