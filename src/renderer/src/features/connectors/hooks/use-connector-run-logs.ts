import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { ConnectorRunRecord } from '../../../../../shared/ipc-types'

interface UseConnectorRunLogsOptions {
  limit?: number
}

interface UseConnectorRunLogsResult {
  runLogs: ConnectorRunRecord[]
  isRunLogsLoading: boolean
  refreshRunLogs: () => Promise<void>
  clearRunLogs: () => Promise<void>
}

const DEFAULT_LOG_LIMIT = 30

export const useConnectorRunLogs = (
  options: UseConnectorRunLogsOptions = {}
): UseConnectorRunLogsResult => {
  const [runLogs, setRunLogs] = useState<ConnectorRunRecord[]>([])
  const [isRunLogsLoading, setIsRunLogsLoading] = useState(false)

  const limit =
    typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? Math.max(1, Math.floor(options.limit))
      : DEFAULT_LOG_LIMIT

  const refreshRunLogs = useCallback(async (): Promise<void> => {
    setIsRunLogsLoading(true)
    try {
      const logs = await window.ctg.integrations.getRunLogs(limit)
      setRunLogs(logs)
    } catch {
      setRunLogs([])
    } finally {
      setIsRunLogsLoading(false)
    }
  }, [limit])

  const clearRunLogs = useCallback(async (): Promise<void> => {
    try {
      const result = await window.ctg.integrations.clearRunLogs()
      if (!result.success) {
        throw new Error('Connector diagnostics could not be cleared')
      }

      setRunLogs([])
      toast.success('Connector diagnostics cleared')
    } catch (error) {
      toast.error('Failed to clear connector diagnostics', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }, [])

  useEffect(() => {
    void refreshRunLogs()
  }, [refreshRunLogs])

  return {
    runLogs,
    isRunLogsLoading,
    refreshRunLogs,
    clearRunLogs
  }
}
