import { SafeParseReturnType, ZodTypeAny, z } from 'zod'
import { withGetType, zodToTs } from 'zod-to-ts'

export function unwrapZod<T>(result: SafeParseReturnType<any, T>): T {
  if (result.success) {
    return result.data
  }
  throw new Error(
    'Validation errors: \n\n' +
      result.error.issues.map((x) => `[${x.code}] at ${x.path.join('.')}: ${x.message}`).join('\n'),
  )
}

export function zodTransformUnion<A extends ZodTypeAny, B extends ZodTypeAny, C extends ZodTypeAny[]>(
  a: A,
  b: B,
  ...rest: C
) {
  const r = withGetType(z.union([a, b, ...rest]), () => {
    return zodToTs(a).node
  })
  return r as z.ZodType<A['_output'], A['_def'], (typeof r)['_input']>
}
