import type { ExternalRuntimeHealthStatus } from '../../../shared/ipc-types'
import type { ExternalRuntimeRegistry } from './external-runtime-registry'

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
    const activeRuntimeId = await this.getActiveRuntimeId()
    const requestedRuntimeId = request.preferredRuntime?.trim() || null
    const onlyRuntimeId = runtimes.length === 1 ? runtimes[0].id : null

    if (runtimes.length === 0) {
      throw new Error('No external runtimes are registered.')
    }

    if (requestedRuntimeId) {
      const expectedRuntimeId = activeRuntimeId || onlyRuntimeId
      if (!expectedRuntimeId || requestedRuntimeId !== expectedRuntimeId) {
        throw new Error(
          `The requested runtime "${requestedRuntimeId}" is not currently enabled in Agents > Integrations.`
        )
      }

      return this.resolveReadyRuntime(
        requestedRuntimeId,
        activeRuntimeId
          ? 'because it was explicitly requested and is enabled.'
          : 'because it was explicitly requested and is the only registered external runtime.'
      )
    }

    if (activeRuntimeId) {
      return this.resolveReadyRuntime(
        activeRuntimeId,
        'because it is the runtime currently enabled in Agents > Integrations.'
      )
    }

    if (onlyRuntimeId) {
      return this.resolveReadyRuntime(
        onlyRuntimeId,
        'because it is the only registered external runtime.'
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
