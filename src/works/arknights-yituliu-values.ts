import { z } from 'zod'
import { buildData } from '../dc-utils.js'
import { unwrapZod } from '../zutils.js'

export async function makeArknightsYituliuValues() {
  const file = 'arknights-yituliu-values'

  await buildData(
    file,
    async () => {
      const data = await (await fetch('https://ark.yituliu.cn/backend/item/export/json')).json()
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
      const data = { values: unwrapZod(Shape.safeParse(raw)) }
      return [data, z.object({ values: Shape })]
    },
  )
}

const Shape = z.array(
  z.object({
    itemId: z.string(),
    itemName: z.string(),
    itemValue: z.number().nonnegative(),
    itemValueAp: z.number().nonnegative(),
    rarity: z.number().int().min(1).max(5),
  }),
)
