import { z } from 'zod'
import { buildData } from '../dc-utils.js'
import { unwrapZod } from '../zutils.js'

export async function makeArknightsYituliuValues() {
  const file = 'arknights-yituliu-values'

  await buildData(
    file,
    async () => {
      const data = await (await fetch('https://backend.yituliu.cn/item/value?expCoefficient=0.625')).json()
      const now = new Date()
      const nowText = now.toJSON()
      const version = {
        id: nowText,
        text: nowText,
        timestamp: now.getTime(),
        sources: ['https://ark.yituliu.cn'],
        schema: 0,
      }
      version.schema = 1
      return [version, data]
    },
    async (raw) => {
      const origin = unwrapZod(Origin.safeParse(raw))
      if (origin.code !== 200) {
        throw new Error(`code: ${origin.code}, msg: ${origin.msg}`)
      }
      const data = {
        values: origin.data.map((v) => ({
          itemId: v.itemId,
          itemName: v.itemName,
          itemValue: v.itemValue,
          itemValueAp: v.itemValueAp,
          rarity: v.rarity,
        })),
      }
      return [data, z.object({ values: Shape })]
    },
  )
}

const Origin = z.object({
  code: z.number(),
  msg: z.string(),
  data: z.array(
    z.object({
      id: z.number(),
      itemId: z.string(),
      itemName: z.string(),
      itemValue: z.number(),
      itemValueAp: z.number(),
      rarity: z.number().int().min(1).max(5),
      type: z.string(),
      cardNum: z.number(),
      version: z.string(),
      weight: z.number(),
    }),
  ),
})

const Shape = z.array(
  z.object({
    itemId: z.string(),
    itemName: z.string(),
    itemValue: z.number().nonnegative(),
    itemValueAp: z.number().nonnegative(),
    rarity: z.number().int().min(1).max(5),
  }),
)
