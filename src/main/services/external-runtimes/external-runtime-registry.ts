import { EventEmitter } from 'events'
import type {
  ExternalRuntimeApprovalDecision,
  ExternalRuntimeApprovalRequest,
  ExternalRuntimeConfig,
  ExternalRuntimeDescriptor,
  ExternalRuntimeEvent,
  ExternalRuntimeHealthStatus,
  ExternalRuntimeRunRecord,
  ExternalRuntimeRunRequest,
  ExternalRuntimeRunResult
} from '../../../shared/ipc-types'
import type { ExternalRuntimeAdapter } from './external-runtime-adapter'

interface ListRunsOptions {
  chatId?: string
  runtimeId?: string
}

export class ExternalRuntimeRegistry extends EventEmitter {
  private readonly adapters = new Map<string, ExternalRuntimeAdapter>()

  register(adapter: ExternalRuntimeAdapter): void {
    const runtimeId = adapter.descriptor.id
    if (this.adapters.has(runtimeId)) {
      return
    }

    this.adapters.set(runtimeId, adapter)
    adapter.on('run-event', (event) => {
      this.emit('run-event', event satisfies ExternalRuntimeEvent)
    })
    adapter.on('approval-request', (request) => {
      this.emit('approval-request', request satisfies ExternalRuntimeApprovalRequest)
    })
    adapter.on('health-updated', (status) => {
      this.emit('health-updated', status satisfies ExternalRuntimeHealthStatus)
    })
  }

  listRuntimes(): ExternalRuntimeDescriptor[] {
    return Array.from(this.adapters.values())
      .map((adapter) => adapter.descriptor)
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  getDescriptor(runtimeId: string): ExternalRuntimeDescriptor {
    return this.getAdapter(runtimeId).descriptor
  }

  async getConfig(runtimeId: string): Promise<ExternalRuntimeConfig> {
    return this.getAdapter(runtimeId).getConfig()
  }

  async saveConfig(runtimeId: string, config: ExternalRuntimeConfig): Promise<void> {
    await this.getAdapter(runtimeId).saveConfig(config)
  }

  async getHealth(runtimeId: string): Promise<ExternalRuntimeHealthStatus> {
    return this.getAdapter(runtimeId).getHealth()
  }

  async startRun(request: ExternalRuntimeRunRequest): Promise<ExternalRuntimeRunResult> {
    return this.getAdapter(request.runtimeId).startRun(request)
  }

  async cancelRun(runtimeId: string, runId: string): Promise<boolean> {
    return this.getAdapter(runtimeId).cancelRun(runId)
  }

  async getRun(runtimeId: string, runId: string): Promise<ExternalRuntimeRunResult | null> {
    return this.getAdapter(runtimeId).getRun(runId)
  }

  async listRuns(options?: ListRunsOptions): Promise<ExternalRuntimeRunRecord[]> {
    if (options?.runtimeId) {
      return this.getAdapter(options.runtimeId).listRuns(options.chatId)
    }

    const runs = await Promise.all(
      Array.from(this.adapters.values()).map((adapter) => adapter.listRuns(options?.chatId))
    )

    return runs.flat().sort((left, right) => right.startedAt.localeCompare(left.startedAt))
  }

  async approveRequest(decision: ExternalRuntimeApprovalDecision): Promise<void> {
    await this.getAdapter(decision.runtimeId).approveRequest(decision)
  }

  async denyRequest(runtimeId: string, approvalId: string): Promise<void> {
    await this.getAdapter(runtimeId).denyRequest(approvalId)
  }

  private getAdapter(runtimeId: string): ExternalRuntimeAdapter {
    const adapter = this.adapters.get(runtimeId)
    if (!adapter) {
      throw new Error(`External runtime "${runtimeId}" is not registered.`)
    }
    return adapter
  }
}
