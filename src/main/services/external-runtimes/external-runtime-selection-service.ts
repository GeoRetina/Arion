import type { ExternalRuntimeHealthStatus } from '../../../shared/ipc-types'
import type { ExternalRuntimeRegistry } from './external-runtime-registry'
import { resolveRegisteredExternalRuntimeId } from '../../../shared/utils/external-runtime-config'

export interface ExternalRuntimeSelectionRequest {
  preferredRuntime?: string
}

export interface ExternalRuntimeSelectionDecision {
  runtimeId: string
  runtimeName: string
  reason: string
}

function summarizeHealthIssue(
  health: ExternalRuntimeHealthStatus | null,
  runtimeName: string
): string {
  if (!health) {
    return `${runtimeName} health could not be determined.`
  }

  const detail = [health.install.message, health.authMessage].filter(Boolean).join(' ').trim()
  return detail || `${runtimeName} is not ready.`
}

export class ExternalRuntimeSelectionService {
  constructor(
    private readonly registry: ExternalRuntimeRegistry,
    private readonly getActiveRuntimeId: () => Promise<string | null>
  ) {}

  async selectRuntime(
    request: ExternalRuntimeSelectionRequest
  ): Promise<ExternalRuntimeSelectionDecision> {
    const runtimes = this.registry.listRuntimes()
    const configuredRuntimeId = await this.getActiveRuntimeId()
    const requestedRuntimeId = request.preferredRuntime?.trim() || null
    const activeRuntimeId = resolveRegisteredExternalRuntimeId(configuredRuntimeId, runtimes)

    if (runtimes.length === 0) {
      throw new Error('No external runtimes are registered.')
    }

    if (requestedRuntimeId) {
      if (!activeRuntimeId || requestedRuntimeId !== activeRuntimeId) {
        throw new Error(
          `The requested runtime "${requestedRuntimeId}" is not currently enabled in Agents > Integrations.`
        )
      }

      return this.resolveReadyRuntime(
        requestedRuntimeId,
        'because it was explicitly requested and is enabled.'
      )
    }

    if (activeRuntimeId) {
      return this.resolveReadyRuntime(
        activeRuntimeId,
        'because it is the runtime currently enabled in Agents > Integrations.'
      )
    }

    throw new Error(
      'No external runtime is enabled. Select one in Agents > Integrations before running external analysis.'
    )
  }

  private async resolveReadyRuntime(
    runtimeId: string,
    reasonSuffix: string
  ): Promise<ExternalRuntimeSelectionDecision> {
    const descriptor = this.registry.getDescriptor(runtimeId)
    const health = await this.registry.getHealth(runtimeId).catch(() => null)

    if (!health?.isReady) {
      throw new Error(
        `${descriptor.name} is not ready for runs. ${summarizeHealthIssue(health, descriptor.name)}`
      )
    }

    return {
      runtimeId: descriptor.id,
      runtimeName: descriptor.name,
      reason: `Selected ${descriptor.name} ${reasonSuffix}`
    }
  }
}
