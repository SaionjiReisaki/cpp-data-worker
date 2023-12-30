import { z } from 'zod'
import { buildData } from '../dc-utils.js'
import { unwrapZod } from '../zutils.js'

export async function makeReverse1999HisboundenDutyDrops(branch: 'china') {
  const file = 'reverse1999-hisboundenduty-drops-' + branch

  await buildData(
    file,
    async () => {
      const data = await (
        await fetch(
          'https://cpp-worker-1303013623.cos.ap-chengdu.myqcloud.com/reverse1999/drops.json?q-sign-algorithm=sha1&q-ak=AKIDlQt89z0kP0X6f8bs9SkGiAUjsmU1NXWM&q-sign-time=1703921975;2019281975&q-key-time=1703921975;2019281975&q-header-list=host&q-url-param-list=&q-signature=331d0d84b081c698feba26b7a905e3be70b82479',
        )
      ).json()
      const version = {
        id: data.updatedAt,
        text: data.updatedAt,
        timestamp: Date.parse(data.updatedAt),
        sources: [],
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
  levelReport: z.record(
    z.string().regex(/^\d+-\d+(普通|厄险)\(\d+\)(Ver\d+.\d+)?$/),
    z.object({
      count: z.number().int().nonnegative(),
      cost: z.number().int().nonnegative(),
      drops: z.record(z.string(), z.number().int().nonnegative()),
    }),
  ),
})
