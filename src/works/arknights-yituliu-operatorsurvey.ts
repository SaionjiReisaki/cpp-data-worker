import { DateTime } from 'luxon'
import { z } from 'zod'
import { buildData } from '../dc-utils.js'
import { unwrapZod } from '../zutils.js'

export async function makeArknightsYituliuOperatorSurvey() {
  const file = 'arknights-yituliu-operatorsurvey'

  await buildData(
    file,
    async () => {
      const data = await (await fetch('https://ytl.viktorlab.cn/backend/survey/operator/result')).json()
      if (data.code !== 200) throw new Error('Unexpected response code: ' + data.code)

      const now = DateTime.fromFormat(data.data.updateTime, 'yyyy-MM-dd HH:mm:ss', {
        zone: 'Asia/Shanghai',
      }).toJSDate()
      const nowText = now.toJSON()
      const version = {
        id: nowText,
        text: nowText,
        timestamp: now.getTime(),
        sources: ['https://ytl.viktorlab.cn'],
        schema: 0,
      }
      version.schema = 1
      return [version, data]
    },
    async (raw) => {
      const data = unwrapZod(Shape.safeParse(raw.data))
      return [data, Shape]
    },
  )
}

const SurveyNumber = z.number().min(0).max(1)

const SurveyItem = z.object({
  rank0: SurveyNumber,
  rank1: SurveyNumber,
  rank2: SurveyNumber,
  rank3: SurveyNumber,
  count: SurveyNumber,
})

const Shape = z.object({
  result: z.array(
    z.object({
      charId: z.string().regex(/^char_\d+_/),
      rarity: z.number().int().min(1).max(6),
      own: SurveyNumber,
      elite: SurveyItem,
      skill1: SurveyItem,
      skill2: SurveyItem,
      skill3: SurveyItem,
      modX: SurveyItem,
      modY: SurveyItem,
      modD: SurveyItem,
    }),
  ),
  userCount: z.number().int().nonnegative(),
  updateTime: z.string(),
})
