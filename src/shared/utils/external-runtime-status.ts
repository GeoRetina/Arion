import type { ExternalRuntimeRunStatus } from '../types/external-runtime-types'

export const externalRuntimeRunStatuses = [
  'queued',
  'starting',
  'running',
  'awaiting-approval',
  'completed',
  'failed',
  'cancelled'
] as const satisfies readonly ExternalRuntimeRunStatus[]

export const externalRuntimeInProgressStatuses = [
  'queued',
  'starting',
  'running',
  'awaiting-approval'
] as const satisfies readonly ExternalRuntimeRunStatus[]

export const externalRuntimeTerminalStatuses = [
  'completed',
  'failed',
  'cancelled'
] as const satisfies readonly ExternalRuntimeRunStatus[]

export type ExternalRuntimeInProgressStatus = (typeof externalRuntimeInProgressStatuses)[number]
export type ExternalRuntimeTerminalStatus = (typeof externalRuntimeTerminalStatuses)[number]

export function isExternalRuntimeRunStatus(value: string): value is ExternalRuntimeRunStatus {
  return (externalRuntimeRunStatuses as readonly string[]).includes(value)
}

export function isExternalRuntimeInProgressStatus(
  status: ExternalRuntimeRunStatus | null | undefined
): status is ExternalRuntimeInProgressStatus {
  return status != null && (externalRuntimeInProgressStatuses as readonly string[]).includes(status)
}

export function isExternalRuntimeTerminalStatus(
  status: ExternalRuntimeRunStatus | null | undefined
): status is ExternalRuntimeTerminalStatus {
  return status != null && (externalRuntimeTerminalStatuses as readonly string[]).includes(status)
}
