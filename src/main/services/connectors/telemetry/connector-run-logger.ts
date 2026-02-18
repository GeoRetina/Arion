import type { ConnectorRunRecord } from '../../../../shared/ipc-types'
import type { ConnectorRunLogInput } from './types'

const DEFAULT_MAX_RUN_HISTORY = 500

export class ConnectorRunLogger {
  private readonly records: ConnectorRunRecord[] = []
  private readonly maxHistory: number

  constructor(maxHistory = DEFAULT_MAX_RUN_HISTORY) {
    this.maxHistory = Math.max(50, maxHistory)
  }

  public log(input: ConnectorRunLogInput): ConnectorRunRecord {
    const record: ConnectorRunRecord = {
      runId: input.runId,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      durationMs: input.durationMs,
      chatId: input.chatId,
      agentId: input.agentId,
      integrationId: input.integrationId,
      capability: input.capability,
      backend: input.backend,
      outcome: input.outcome,
      message: input.message,
      errorCode: input.errorCode
    }

    this.records.unshift(record)
    if (this.records.length > this.maxHistory) {
      this.records.length = this.maxHistory
    }
    return record
  }

  public list(limit = 50): ConnectorRunRecord[] {
    const safeLimit = Math.max(1, Math.min(limit, this.maxHistory))
    return this.records.slice(0, safeLimit)
  }

  public clear(): void {
    this.records.length = 0
  }
}
