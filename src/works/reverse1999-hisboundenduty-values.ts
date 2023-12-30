import { z } from 'zod'
import { buildData } from '../dc-utils.js'
import { unwrapZod } from '../zutils.js'

export async function makeReverse1999HisboundenDutyValues(branch: 'china') {
  const file = 'reverse1999-hisboundenduty-values-' + branch

  await buildData(
    file,
    async () => {
      const data = await (
        await fetch(
          'https://cpp-worker-1303013623.cos.ap-chengdu.myqcloud.com/reverse1999/values.json?q-sign-algorithm=sha1&q-ak=AKIDlQt89z0kP0X6f8bs9SkGiAUjsmU1NXWM&q-sign-time=1703922006;2019282006&q-key-time=1703922006;2019282006&q-header-list=host&q-url-param-list=&q-signature=74905eb842b52c95dbd5e97633d87f59b9c0eb14',
        )
      ).json()
      const version = {
        id: data.updatedAt,
        text: data.updatedAt,
        timestamp: Date.parse(data.updatedAt),
        sources: [data.sourceUrl],
        schema: 0,
      }
      version.schema = 1
      return [version, data]
    },
    async (raw) => {
      const data = unwrapZod(Shape.safeParse(raw))
      return [data, Shape]
    },
  )
}

const Shape = z.object({
  updatedAt: z.string(),
  sourceUrl: z.string(),
  values: z.record(z.string().regex(/^[0-9]+$/), z.string().regex(/^[0-9]+(\.[0-9]+)?$/)),
})
