type OptionalKeys<T extends object> = {
  [K in keyof T]-?: undefined extends T[K] ? K : never
}[keyof T]

type RequiredKeys<T extends object> = Exclude<keyof T, OptionalKeys<T>>

export type WithoutUndefined<T extends object> = {
  [K in RequiredKeys<T>]: T[K]
} & {
  [K in OptionalKeys<T>]?: Exclude<T[K], undefined>
}

export function omitUndefined<T extends object>(value: T): WithoutUndefined<T> {
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([, entryValue]) => entryValue !== undefined
    )
  ) as WithoutUndefined<T>
}
