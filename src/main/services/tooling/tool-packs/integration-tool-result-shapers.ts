import type { ConnectorBackend } from '../../../../shared/ipc-types'

export interface IntegrationToolSuccessResultInput {
  runId: string
  backend: ConnectorBackend
  durationMs: number
  data: unknown
  details: unknown
}

export type IntegrationToolSuccessResultTransformer = (
  input: IntegrationToolSuccessResultInput
) => Record<string, unknown>

export const buildDefaultIntegrationToolSuccessResult: IntegrationToolSuccessResultTransformer = (
  input
) => ({
  status: 'success',
  run_id: input.runId,
  backend: input.backend,
  duration_ms: input.durationMs,
  data: input.data,
  details: input.details
})

export const buildQgisListAlgorithmsSuccessResult: IntegrationToolSuccessResultTransformer = (
  input
) => {
  const baseResult = buildDefaultIntegrationToolSuccessResult(input)
  const dataRecord = toRecord(input.data)
  const shortlistRecord = toRecord(dataRecord.result)
  const algorithms = Array.isArray(shortlistRecord.algorithms) ? shortlistRecord.algorithms : null

  if (!algorithms) {
    return baseResult
  }

  return {
    ...baseResult,
    ...(typeof dataRecord.operation === 'string' ? { operation: dataRecord.operation } : {}),
    algorithms,
    shortlist: algorithms,
    ...(readNumber(shortlistRecord.totalAlgorithms) !== undefined
      ? { total_algorithms: readNumber(shortlistRecord.totalAlgorithms) }
      : {}),
    ...(readNumber(shortlistRecord.matchedAlgorithms) !== undefined
      ? { matched_algorithms: readNumber(shortlistRecord.matchedAlgorithms) }
      : {}),
    ...(readNumber(shortlistRecord.returnedAlgorithms) !== undefined
      ? { returned_algorithms: readNumber(shortlistRecord.returnedAlgorithms) }
      : {}),
    ...(typeof shortlistRecord.truncated === 'boolean'
      ? { truncated: shortlistRecord.truncated }
      : {}),
    ...(Object.keys(toRecord(shortlistRecord.filters)).length > 0
      ? { filters: toRecord(shortlistRecord.filters) }
      : {}),
    ...(Object.keys(toRecord(shortlistRecord.catalog)).length > 0
      ? { catalog: toRecord(shortlistRecord.catalog) }
      : {})
  }
}

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}
