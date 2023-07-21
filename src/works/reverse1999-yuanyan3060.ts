import pProps from 'p-props'
import { z } from 'zod'
import { buildData, dataContainerVersionFromGitCommit } from '../dc-utils.js'
import { fetchGitHubFile, getGitHubLatestCommitForPath } from '../github.js'
import { unwrapZod } from '../zutils.js'

export async function makeReverse1999Yuanyan3060(lang: 'zh_CN') {
  const file = 'reverse1999-yuanyan3060-' + lang
  const repo = 'yuanyan3060/Reverse1999Resource'

  await buildData(
    file,
    async () => {
      const commit = await getGitHubLatestCommitForPath(repo, 'main', 'Json')
      const version = dataContainerVersionFromGitCommit(repo, commit)
      version.text = commit.commit.committer.date
      version.schema = 1
      return [version, commit]
    },
    async (commit) => {
      const work = async function (p: string) {
        const r = await fetchGitHubFile(repo, commit.sha, p)
        return JSON.parse(Buffer.from(r).toString('utf-8'))
      }

      const raw = await pProps({
        exChapters: work('Json/chapter.json'),
        exEpisodes: work('Json/episode.json'),
        exCharacters: work('Json/character.json'),
        exItems: work('Json/item.json'),
        exCurrencies: work('Json/currency.json'),
        exFormulas: work('Json/formula.json'),
        exCharacterRank: work('Json/character_rank.json'),
        exCharacterConsume: work('Json/character_cosume.json'),
        exCharacterTalent: work('Json/character_talent.json'),
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
      rare: z.number().int().min(1).max(5),
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
