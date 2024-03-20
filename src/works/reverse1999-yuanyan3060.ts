import pProps from 'p-props'
import { z } from 'zod'
import { buildData } from '../dc-utils.js'
import { PrivateRepo } from '../private-repo.js'
import { unwrapZod } from '../zutils.js'

export async function makeReverse1999Yuanyan3060(lang: 'zh_CN') {
  const file = 'reverse1999-yuanyan3060-' + lang
  const repo = 're1999-excel'
  return buildReverse1999(file, repo)
}

export async function buildReverse1999(file: string, repo: string, locale?: { lang: string; server: string }) {
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

      let converterType: ReturnType<typeof makeReverse1999Type>
      if (locale) {
        const language = await work(`language_${locale.lang}.json`)
        const languageServer = await work(`language_server_${locale.server}.json`)
        converterType = makeReverse1999Type({ language, languageServer })
      } else {
        converterType = makeReverse1999Type()
      }

      const data = unwrapZod(converterType.safeParse(raw))
      const data2 = unwrapZod(Reverse1999.safeParse(data))
      return [data2, Reverse1999]
    },
  )
}

const consume = z.string().regex(/^(?:|(?:(?:[1|2]#\d+#\d+\|)*(?:[1|2]#\d+#\d+)$))$/, 'Invalid consume value')

type LanguageRow = { id: string; value: string }

function makeReverse1999Type(l?: { language: LanguageRow[]; languageServer: LanguageRow[] }) {
  const LanguageString = l
    ? z
        .string()
        .refine(
          (v) => {
            if (v === '') return true
            return l?.language.some((x) => x.id === v)
          },
          {
            message: `Invalid language string`,
          },
        )
        .transform((v) => {
          if (v === '') return ''
          return l.language.find((x) => x.id === v)!.value
        })
    : z.string()

  return z.object({
    exChapters: z.array(
      z.object({
        id: z.number(),
        chapterIndex: z.string(),
        type: z.number(),
        name: LanguageString,
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
        name: LanguageString,
      }),
    ),
    exCharacters: z.array(
      z.object({
        id: z.number(),
        isOnline: z.enum(['1', '0']),
        name: LanguageString,
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
        name: LanguageString,
        subType: z.number().int(),
        rare: z.number().int().min(0).max(5),
        icon: z.string(),
        isShow: z.number().int().min(0).max(1),
      }),
    ),
    exCurrencies: z.array(
      z.object({
        id: z.number(),
        name: LanguageString,
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
        cosume: z.string().regex(/^(2#5#(\d+)\|2#3#(\d+)|)$/),
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
}

const Reverse1999 = makeReverse1999Type()
