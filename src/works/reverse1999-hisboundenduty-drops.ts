import { z } from 'zod'
import { buildData } from '../dc-utils.js'
import { unwrapZod } from '../zutils.js'

export async function makeReverse1999HisboundenDutyDrops(branch: 'china' | 'haiwai') {
  const file = 'reverse1999-hisboundenduty-drops-' + branch
  const url = {
    china:
      'https://cpp-worker-1303013623.cos.ap-chengdu.myqcloud.com/reverse1999/drops.json?q-sign-algorithm=sha1&q-ak=AKIDlQt89z0kP0X6f8bs9SkGiAUjsmU1NXWM&q-sign-time=1703921975;2019281975&q-key-time=1703921975;2019281975&q-header-list=host&q-url-param-list=&q-signature=331d0d84b081c698feba26b7a905e3be70b82479',
    haiwai:
      'https://cpp-worker-1303013623.cos.ap-chengdu.myqcloud.com/reverse1999/drops-hw.json?q-sign-algorithm=sha1&q-ak=AKIDlQt89z0kP0X6f8bs9SkGiAUjsmU1NXWM&q-sign-time=1721725760;2037085760&q-key-time=1721725760;2037085760&q-header-list=host&q-url-param-list=&q-signature=06772043957f4f8e04f13c2389ec6d0d7e544e6b',
  }

  await buildData(
    file,
    async () => {
      const data = await (await fetch(url[branch])).json()
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
  levelReport: z.record(
    z.string().regex(/^\d+-\d+(普通|厄险)\(\d+\)(Ver\d+.\d+)?$/),
    z.object({
      count: z.number().int().nonnegative(),
      cost: z.number().int().nonnegative(),
      drops: z.record(z.string(), z.number().int().nonnegative()),
    }),
  ),
})
