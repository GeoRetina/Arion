interface RuntimeIdLike {
  id: string
}

export function normalizeExternalRuntimeId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export function resolveRegisteredExternalRuntimeId<T extends RuntimeIdLike>(
  value: unknown,
  runtimes: readonly T[]
): string | null {
  const normalizedRuntimeId = normalizeExternalRuntimeId(value)
  if (!normalizedRuntimeId) {
    return null
  }

  return runtimes.some((runtime) => runtime.id === normalizedRuntimeId) ? normalizedRuntimeId : null
}
