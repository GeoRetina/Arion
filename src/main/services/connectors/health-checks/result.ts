import type { IntegrationHealthCheckResult, IntegrationStatus } from '../../../../shared/ipc-types'

export type ConnectionMode = 'test' | 'connect'

export const createHealthCheckResult = (
  success: boolean,
  status: IntegrationStatus,
  message: string,
  details?: Record<string, unknown>
): IntegrationHealthCheckResult => {
  return {
    success,
    status,
    message,
    checkedAt: new Date().toISOString(),
    details
  }
}
