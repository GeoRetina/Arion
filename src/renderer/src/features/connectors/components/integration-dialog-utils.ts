import type { IntegrationHealthCheckResult } from '../../../../../shared/ipc-types'

interface RunIntegrationHealthActionOptions {
  action: () => Promise<IntegrationHealthCheckResult>
  setPending: (pending: boolean) => void
  onStart?: () => void
  onResult: (result: IntegrationHealthCheckResult) => void
  onSuccess?: (result: IntegrationHealthCheckResult) => void
  onError: (error: unknown) => void
}

export const buildIntegrationErrorResult = (
  error: unknown,
  fallbackMessage: string
): IntegrationHealthCheckResult => ({
  success: false,
  status: 'error',
  message: error instanceof Error ? error.message : fallbackMessage,
  checkedAt: new Date().toISOString()
})

export async function runIntegrationHealthAction({
  action,
  setPending,
  onStart,
  onResult,
  onSuccess,
  onError
}: RunIntegrationHealthActionOptions): Promise<void> {
  setPending(true)
  onStart?.()

  try {
    const result = await action()
    onResult(result)

    if (result.success) {
      onSuccess?.(result)
    }
  } catch (error) {
    onError(error)
  } finally {
    setPending(false)
  }
}
