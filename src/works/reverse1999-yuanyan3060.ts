import pProps from 'p-props'
import { z } from 'zod'
import { buildData } from '../dc-utils.js'
import { PrivateRepo } from '../private-repo.js'
import { unwrapZod } from '../zutils.js'

export async function makeReverse1999Yuanyan3060(lang: 'zh_CN') {
  const file = 'reverse1999-yuanyan3060-' + lang
  const repo = 're1999-excel'

  const p = new PrivateRepo(repo)
  await p.git.pull()
  await buildData(
    file,
    async () => {
      const commit = await p.getCommit()
      const version = {
        id: commit.latest!.hash,
        text: commit.latest!.message,
        timestamp: Date.parse(commit.latest!.date),
        sources: [],
        schema: 0,
      }
      version.schema = 1
      return [version]
    },
    async () => {
      const work = async function (s: string) {
        const r = await p.read(s)
        return JSON.parse(Buffer.from(r).toString('utf-8'))
      }

      const raw = await pProps({
        exChapters: work('chapter.json'),
        exEpisodes: work('episode.json'),
        exCharacters: work('character.json'),
        exItems: work('item.json'),
        exCurrencies: work('currency.json'),
        exFormulas: work('formula.json'),
        exCharacterRank: work('character_rank.json'),
        exCharacterConsume: work('character_cosume.json'),
        exCharacterTalent: work('character_talent.json'),
      })

      const data = unwrapZod(Reverse1999Yuanyan3060.safeParse(raw))
      return [data, Reverse1999Yuanyan3060]
    },
  )
}

const consume = z.string().regex(/^(?:|(?:(?:[1|2]#\d+#\d+\|)*(?:[1|2]#\d+#\d+)$))$/, 'Invalid consume value')

const Reverse1999Yuanyan3060 = z.object({
  exChapters: z.array(
    z.object({
      id: z.number(),
      chapterIndex: z.string(),
      type: z.number(),
      name: z.string(),
    }),
  ),
  exEpisodes: z.array(
    z.object({
      id: z.number(),
      type: z.number().int(),
      chapterId: z.number(),
      preEpisode: z.number(),
      cost: consume,
      battleId: z.number(),
      name: z.string(),
    }),
  ),
  exCharacters: z.array(
    z.object({
      id: z.number(),
      isOnline: z.enum(['1', '0']),
      name: z.string(),
      nameEng: z.string(),
      rare: z.number().int().min(1).max(5),
      career: z.number().int().min(1).max(6),
      dmgType: z.number().int().min(1).max(2),
      skinId: z.number().int(),
    }),
  ),
  exItems: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      subType: z.number().int(),
      rare: z.number().int().min(0).max(5),
      icon: z.string(),
      isShow: z.number().int().min(0).max(1),
    }),
  ),
  exCurrencies: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      icon: z.string(),
    }),
  ),
  exFormulas: z.array(
    z.object({
      id: z.number(),
      type: z.number(),
      produce: consume,
      costMaterial: consume,
      costScore: consume,
    }),
  ),
  exCharacterRank: z.array(
    z.object({
      heroId: z.number(),
      rank: z.number().int(),
      consume: consume,
    }),
  ),
  exCharacterConsume: z.array(
    z.object({
      rare: z.number().int().min(1).max(5),
      cosume: z.string().regex(/^(2#5#(\d+)\|2#3#(\d+)|)$/), // should be consume
      level: z.number().int(),
    }),
  ),
  exCharacterTalent: z.array(
    z.object({
      talentId: z.number(),
      heroId: z.number(),
      consume: consume,
      requirement: z.number(),
    }),
  ),
})
