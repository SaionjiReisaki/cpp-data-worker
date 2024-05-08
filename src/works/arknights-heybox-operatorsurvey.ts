import { parse } from 'csv-parse'
import { z } from 'zod'
import { buildData, readData } from '../dc-utils.js'
import { IDataContainer } from '../dc.js'
import { unwrapZod } from '../zutils.js'
import type { ArknightsKengxxiao } from './arknights-kengxxiao.js'

export async function makeArknightsHeyboxOperatorSurvey() {
  const file = 'arknights-heybox-operatorsurvey'

  await buildData(
    file,
    async () => {
      const excel = await readData<z.TypeOf<typeof ArknightsKengxxiao>>('arknights-kengxxiao-zh_CN')
      const res = await fetch(
        'https://docs.google.com/spreadsheets/d/1RAbVJCTsYCyXl-2ZsNHquJVxEE8qgKzIWfuxddAGxxw/export?gid=0&format=csv',
      )
      if (!res.ok) throw new Error('Unexpected response code: ' + res.status)
      const body = await res.text()

      const records = []
      for await (const record of parse(body, { columns: true })) {
        records.push(record)
      }

      const data = unwrapZod(RawShape.safeParse(records))

      const now = new Date(
        Math.max(
          ...data
            .flatMap((i) => [i.updated, i.updated_lv2])
            .filter((x) => x)
            .map((x) => parseInt(x, 10)),
        ),
      )
      const nowText = now.toJSON()
      const version = {
        id: nowText,
        text: nowText,
        timestamp: now.getTime(),
        sources: ['https://xiaoheihe.cn'],
        schema: 0,
      }
      version.schema = 1

      const final = {
        rows: data.map((i) => {
          return {
            i: findId(excel, i.name, i.avatar),
            o: num(i.hold_rate),
            e: [num(i.stat_elite_0), num(i.stat_elite_1), num(i.stat_elite_2)],
            e2s1: [
              num(i.stat_elite2_skill1_0),
              num(i.stat_elite2_skill1_1),
              num(i.stat_elite2_skill1_2),
              num(i.stat_elite2_skill1_3),
            ],
            e2s2: [
              num(i.stat_elite2_skill2_0),
              num(i.stat_elite2_skill2_1),
              num(i.stat_elite2_skill2_2),
              num(i.stat_elite2_skill2_3),
            ],
            e2s3: [
              num(i.stat_elite2_skill3_0),
              num(i.stat_elite2_skill3_1),
              num(i.stat_elite2_skill3_2),
              num(i.stat_elite2_skill3_3),
            ],
            e2l: [num(i.stat_elite2_level_0), num(i.stat_elite2_level_1), num(i.stat_elite2_level_2)],
            e2m1: [num(i.stat_elite2_mod1_0), num(i.stat_elite2_mod1_1), num(i.stat_elite2_mod1_2)],
            e2m2: [num(i.stat_elite2_mod2_0), num(i.stat_elite2_mod2_1), num(i.stat_elite2_mod2_2)],
            e2m3: [num(i.stat_elite2_mod3_0), num(i.stat_elite2_mod3_1), num(i.stat_elite2_mod3_2)],
          }
        }),
      }

      return [version, final]
    },
    async (data) => {
      return [data, Shape]
    },
  )
}

function num(s: string) {
  if (s.endsWith('%')) {
    return parseFloat((parseFloat(s.slice(0, -1)) / 100).toFixed(5))
  }
  return null
}

const RawPercent = z.string().regex(/^\d+(?:\.\d+)?%$/)
const RawPercentOrEmpty = z.union([RawPercent, z.string().length(0)])

const RawShape = z.array(
  z
    .object({
      name: z.string(),
      avatar: z.string(),
      // .regex(/^https:\/\/[a-z]{9}.[a-z]{3}-[a-z].com\/[a-z]{6}\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]{32}\.png$/),
      updated: z.string().regex(/^\d+$/),
      updated_lv2: z.union([z.string().length(0), z.string().regex(/^\d+$/)]),
      elite2_rate: RawPercent,
      elite2_rate_lv2: RawPercentOrEmpty,
      hold_rate: RawPercent,
      hold_rate_lv2: RawPercentOrEmpty,
      stat_assist_0: RawPercentOrEmpty,
      stat_assist_1: RawPercentOrEmpty,
      stat_assist_2: RawPercentOrEmpty,
      stat_elite2_assist_0: RawPercentOrEmpty,
      stat_elite2_assist_1: RawPercentOrEmpty,
      stat_elite2_assist_2: RawPercentOrEmpty,
      stat_elite2_level_0: RawPercentOrEmpty,
      stat_elite2_level_1: RawPercentOrEmpty,
      stat_elite2_level_2: RawPercentOrEmpty,
      stat_elite2_mod1_0: RawPercentOrEmpty,
      stat_elite2_mod1_1: RawPercentOrEmpty,
      stat_elite2_mod1_2: RawPercentOrEmpty,
      stat_elite2_mod2_0: RawPercentOrEmpty,
      stat_elite2_mod2_1: RawPercentOrEmpty,
      stat_elite2_mod2_2: RawPercentOrEmpty,
      stat_elite2_mod3_0: RawPercentOrEmpty,
      stat_elite2_mod3_1: RawPercentOrEmpty,
      stat_elite2_mod3_2: RawPercentOrEmpty,
      stat_elite2_skill1_0: RawPercentOrEmpty,
      stat_elite2_skill1_1: RawPercentOrEmpty,
      stat_elite2_skill1_2: RawPercentOrEmpty,
      stat_elite2_skill1_3: RawPercentOrEmpty,
      stat_elite2_skill2_0: RawPercentOrEmpty,
      stat_elite2_skill2_1: RawPercentOrEmpty,
      stat_elite2_skill2_2: RawPercentOrEmpty,
      stat_elite2_skill2_3: RawPercentOrEmpty,
      stat_elite2_skill3_0: RawPercentOrEmpty,
      stat_elite2_skill3_1: RawPercentOrEmpty,
      stat_elite2_skill3_2: RawPercentOrEmpty,
      stat_elite2_skill3_3: RawPercentOrEmpty,
      stat_elite_0: RawPercent,
      stat_elite_1: RawPercent,
      stat_elite_2: RawPercent,
      stat_mod1_0: RawPercentOrEmpty,
      stat_mod1_1: RawPercentOrEmpty,
      stat_mod1_2: RawPercentOrEmpty,
      stat_mod2_0: RawPercentOrEmpty,
      stat_mod2_1: RawPercentOrEmpty,
      stat_mod2_2: RawPercentOrEmpty,
      stat_mod3_0: RawPercentOrEmpty,
      stat_mod3_1: RawPercentOrEmpty,
      stat_mod3_2: RawPercentOrEmpty,
      stat_skill1_0: RawPercentOrEmpty,
      stat_skill1_1: RawPercentOrEmpty,
      stat_skill1_2: RawPercentOrEmpty,
      stat_skill1_3: RawPercentOrEmpty,
      stat_skill2_0: RawPercentOrEmpty,
      stat_skill2_1: RawPercentOrEmpty,
      stat_skill2_2: RawPercentOrEmpty,
      stat_skill2_3: RawPercentOrEmpty,
      stat_skill3_0: RawPercentOrEmpty,
      stat_skill3_1: RawPercentOrEmpty,
      stat_skill3_2: RawPercentOrEmpty,
      stat_skill3_3: RawPercentOrEmpty,
    })
    .strict(),
)

const SurveyNumber = z.union([z.null(), z.number().min(0).max(1).finite()])

const Shape = z.object({
  rows: z.array(
    z
      .object({
        i: z.string(),
        o: SurveyNumber,
        e: z.tuple([SurveyNumber, SurveyNumber, SurveyNumber]),
        e2s1: z.tuple([SurveyNumber, SurveyNumber, SurveyNumber, SurveyNumber]),
        e2s2: z.tuple([SurveyNumber, SurveyNumber, SurveyNumber, SurveyNumber]),
        e2s3: z.tuple([SurveyNumber, SurveyNumber, SurveyNumber, SurveyNumber]),
        e2l: z.tuple([SurveyNumber, SurveyNumber, SurveyNumber]),
        e2m1: z.tuple([SurveyNumber, SurveyNumber, SurveyNumber]),
        e2m2: z.tuple([SurveyNumber, SurveyNumber, SurveyNumber]),
        e2m3: z.tuple([SurveyNumber, SurveyNumber, SurveyNumber]),
      })
      .strict(),
  ),
})

function findId(excel: IDataContainer<z.TypeOf<typeof ArknightsKengxxiao>>, name: string, avatar: string): any {
  if (name === '阿米娅') {
    if (avatar.includes('/eed4c7f904c11c7305a59886f6960951.png')) return 'char_002_amiya'
    if (avatar.includes('/eac3649cd49df605de6e968ad0afa5ec.png')) return 'char_1001_amiya2'
    if (avatar.includes('/353f34dff5b14fc6be8ca2a895f7a231.png')) return 'char_1037_amiya3'
    if (avatar.includes('/char_1037_amiya3.png')) return 'char_1037_amiya3'
    throw new Error('Unexpected avatar for amiya: ' + avatar)
  }
  const chars = Object.entries(excel.data.exCharacters).filter((x) => !!x[1].displayNumber && x[1].name === name)
  if (chars.length !== 1)
    throw new Error('Cannot find character: ' + name + ' ' + avatar + ' ' + chars.map((x) => x[0]).join(':'))
  return chars[0][0]
}
