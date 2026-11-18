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
      version.schema = 7
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
        exShop: work('shop_client_table'),
      })
      raw.exSkin = slimSkins(raw.exSkin)
      raw.exShop = slimShop(raw.exShop)

      const data = unwrapZod(ArknightsKengxxiao.safeParse(raw))
      return [data, ArknightsKengxxiao]
    },
  )
}

// Slimmed before parsing so that the schema, and the .ts type generated from it, describe what the client reads.
// The skin table also carries each skin's story, colours and voice; a skin id without @ is an elite phase's default
// art, not a skin.
function slimSkins(exSkin: any) {
  const charSkins: Record<string, unknown> = {}
  for (const [skinId, skin] of Object.entries<any>(exSkin.charSkins)) {
    if (!skinId.includes('@')) continue
    const d = skin.displaySkin
    charSkins[skinId] = {
      skinId: skin.skinId,
      charId: skin.charId,
      tmplId: skin.tmplId,
      dynIllust: !!skin.dynIllustId,
      displaySkin: {
        skinName: d.skinName,
        skinGroupId: d.skinGroupId,
        skinGroupName: d.skinGroupName,
        sortId: d.sortId,
        getTime: d.getTime,
        obtainApproach: d.obtainApproach,
        displayTagId: d.displayTagId,
      },
    }
  }

  const brandList: Record<string, unknown> = {}
  for (const [brandId, brand] of Object.entries<any>(exSkin.brandList)) {
    brandList[brandId] = {
      brandId: brand.brandId,
      // zh_CN writes one brand as "巫异盛宴 ".
      brandName: brand.brandName.trim(),
      brandCapitalName: brand.brandCapitalName,
      sortId: brand.sortId,
      groupList: list(brand.groupList).map((g) => ({ skinGroupId: g.skinGroupId })),
    }
  }

  return {
    buildinEvolveMap: exSkin.buildinEvolveMap,
    buildinPatchMap: exSkin.buildinPatchMap,
    charSkins,
    brandList,
  }
}

// The store's recommendation tabs and carousel, cut down to the ones that open the skin store. A tab names its skins in
// dataList or in normalSkinParam, or names none and is titled after the skin series it sells; the client tells those
// apart, so tabs without skins are kept.
function slimShop(exShop: any) {
  const recommendList = []
  for (const tab of list(exShop.recommendList)) {
    const items = list(tab.groupList).flatMap((g) => list(g.dataList))
    if (!items.some((d) => d.cmd === 'SKINSHOP')) continue
    const skins: { skinId: string; goodId: string | null }[] = []
    const add = (skinId: string, goodId: string | null) => {
      if (!skins.some((s) => s.skinId === skinId)) skins.push({ skinId, goodId })
    }
    for (const d of items) if (d.cmd === 'SKINSHOP' && d.skinId) add(d.skinId, d.param1 ?? null)
    for (const skinId of list(tab.templateParam?.normalSkinParam?.skinIds)) add(skinId, null)
    recommendList.push({
      tagName: tab.tagName,
      startDatetime: tab.startDatetime,
      endDatetime: tab.endDatetime,
      skins,
    })
  }

  const carousels = list(exShop.carousels)
    .flatMap((c) => list(c.items))
    .filter((i) => i.cmd === 'SKINSHOP' && i.skinId)
    .map((i) => ({ skinId: i.skinId, startTime: i.startTime, endTime: i.endTime }))

  return { recommendList, carousels }
}

// The same {}-for-[] quirk as array() below, for the raw tables walked before parsing.
function list(v: any): any[] {
  return Array.isArray(v) ? v : []
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
  // NONE, or the mode a special operator is trained in (ROGUE: Integrated Strategies). A special operator's levels,
  // elite phases, skills, masteries and modules unlock through that mode's missions, so the material costs the table
  // lists for some of them are never paid.
  spTargetType: z.string(),
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
    charSkins: z.record(
      z.object({
        skinId: z.string(),
        charId: z.string(),
        tmplId: z.union([z.string(), z.null()]),
        dynIllust: z.boolean(),
        displaySkin: z.object({
          skinName: z.union([z.string(), z.null()]),
          skinGroupId: z.union([z.string(), z.null()]),
          skinGroupName: z.union([z.string(), z.null()]),
          sortId: z.number(),
          getTime: z.number(),
          obtainApproach: z.union([z.string(), z.null()]),
          displayTagId: z.union([z.string(), z.null()]),
        }),
      }),
    ),
    brandList: z.record(
      z.object({
        brandId: z.string(),
        brandName: z.string(),
        brandCapitalName: z.union([z.string(), z.null()]),
        sortId: z.number(),
        groupList: array(z.object({ skinGroupId: z.string() })),
      }),
    ),
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
    rooms: z.record(z.object({ name: z.string() })),
    // Base skills; their texts are in arknights-kengxxiao-details.
    buffs: z.record(
      z.object({
        buffName: z.string(),
        roomType: z.string(),
        skillIcon: z.string(),
        efficiency: z.number(),
        sortId: z.number(),
      }),
    ),
    // Each operator's skill slots, each slot's skills from the first to unlock to the last.
    chars: z.record(
      z.object({
        buffChar: array(
          z.object({
            buffData: array(z.object({ buffId: z.string(), cond: unlockCond })),
          }),
        ),
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
  exShop: z.object({
    recommendList: array(
      z.object({
        tagName: z.string(),
        startDatetime: z.number(),
        endDatetime: z.number(),
        skins: array(z.object({ skinId: z.string(), goodId: z.union([z.string(), z.null()]) })),
      }),
    ),
    carousels: array(z.object({ skinId: z.string(), startTime: z.number(), endTime: z.number() })),
  }),
})
