import { isQgisAlgorithmApproved } from './qgis-algorithm-policy'

export interface NormalizedQgisAlgorithmListEntry {
  id: string
  name?: string
  provider?: string
  supportedForExecution: boolean
}

export function normalizeQgisAlgorithmList(
  parsedResult: unknown,
  stdout: string,
  options: {
    allowPluginAlgorithms?: boolean
  } = {}
): {
  algorithms: NormalizedQgisAlgorithmListEntry[]
} {
  const algorithms = new Map<string, NormalizedQgisAlgorithmListEntry>()

  const pushAlgorithm = (entry: { id: string; name?: string; provider?: string }): void => {
    const normalizedId = entry.id.trim()
    if (!normalizedId) {
      return
    }

    algorithms.set(normalizedId, {
      id: normalizedId,
      name: normalizeOptionalText(entry.name),
      provider: normalizeOptionalText(entry.provider) || normalizedId.split(':')[0],
      supportedForExecution: isQgisAlgorithmApproved(normalizedId, {
        allowPluginAlgorithms: options.allowPluginAlgorithms === true
      })
    })
  }

  for (const providerAlgorithm of extractProviderAlgorithms(parsedResult)) {
    pushAlgorithm(providerAlgorithm)
  }

  for (const record of extractObjects(parsedResult)) {
    const algorithmId = readString(record['algorithmId'], record['id'], record['name'])
    if (!algorithmId || !isQgisAlgorithmIdentifier(algorithmId)) {
      continue
    }

    pushAlgorithm({
      id: algorithmId,
      name: readString(record['display_name'], record['name'], record['label']),
      provider: readString(record['provider'], record['providerId'])
    })
  }

  if (algorithms.size === 0) {
    for (const line of stdout.split(/\r?\n/u)) {
      const match = line.trim().match(/^([A-Za-z0-9_]+:[A-Za-z0-9_]+)(?:\s+-\s+(.+))?$/)
      if (!match?.[1]) {
        continue
      }

      pushAlgorithm({
        id: match[1],
        name: match[2]
      })
    }
  }

  return {
    algorithms: Array.from(algorithms.values()).sort((left, right) =>
      left.id.localeCompare(right.id)
    )
  }
}

function extractProviderAlgorithms(
  parsedResult: unknown
): Array<{ id: string; name?: string; provider?: string }> {
  if (!isRecord(parsedResult) || !isRecord(parsedResult['providers'])) {
    return []
  }

  const algorithms: Array<{ id: string; name?: string; provider?: string }> = []
  for (const [providerId, providerValue] of Object.entries(parsedResult['providers'])) {
    if (!isRecord(providerValue) || !isRecord(providerValue['algorithms'])) {
      continue
    }

    for (const [algorithmKey, algorithmValue] of Object.entries(providerValue['algorithms'])) {
      const algorithmRecord = isRecord(algorithmValue) ? algorithmValue : {}
      const algorithmId =
        readString(algorithmRecord['algorithmId'], algorithmRecord['id']) ||
        (isQgisAlgorithmIdentifier(algorithmKey) ? algorithmKey : undefined)

      if (!algorithmId || !isQgisAlgorithmIdentifier(algorithmId)) {
        continue
      }

      algorithms.push({
        id: algorithmId,
        name: readString(
          algorithmRecord['display_name'],
          algorithmRecord['name'],
          algorithmRecord['label']
        ),
        provider: readString(algorithmRecord['provider'], algorithmRecord['providerId'], providerId)
      })
    }
  }

  return algorithms
}

function extractObjects(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter(isRecord)
  }

  if (!isRecord(value)) {
    return []
  }

  const nestedArrays = Object.values(value).filter(Array.isArray)
  for (const nestedArray of nestedArrays) {
    const recordArray = (nestedArray as unknown[]).filter(isRecord)
    if (recordArray.length > 0) {
      return recordArray
    }
  }

  return [value]
}

function readString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return undefined
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isQgisAlgorithmIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_]+:[A-Za-z0-9_]+$/.test(value.trim())
}
