import type {
  ConnectorBackend,
  ConnectorCapability,
  ConnectorCapabilityRegistration,
  IntegrationId
} from '../../../shared/ipc-types'
import type { ConnectorAdapter } from './adapters/connector-adapter'

const DEFAULT_BACKEND_ORDER: ConnectorBackend[] = ['native', 'mcp', 'plugin']

interface ConnectorCapabilityRoute {
  integrationId: IntegrationId
  capability: ConnectorCapability
  adapter: ConnectorAdapter
  description?: string
  sensitivity: 'normal' | 'sensitive'
  priority: number
}

const buildKey = (integrationId: IntegrationId, capability: ConnectorCapability): string =>
  `${integrationId}:${capability}`

export interface RegisterConnectorRouteInput {
  integrationId: IntegrationId
  capability: ConnectorCapability
  adapter: ConnectorAdapter
  description?: string
  sensitivity?: 'normal' | 'sensitive'
  priority?: number
}

export class ConnectorCapabilityRegistry {
  private readonly routes = new Map<string, ConnectorCapabilityRoute[]>()
  private readonly backendOrderByPriority = new Map<ConnectorBackend, number>(
    DEFAULT_BACKEND_ORDER.map((backend, index) => [backend, index])
  )

  public register(input: RegisterConnectorRouteInput): void {
    const route: ConnectorCapabilityRoute = {
      integrationId: input.integrationId,
      capability: input.capability,
      adapter: input.adapter,
      description: input.description,
      sensitivity: input.sensitivity || 'normal',
      priority: input.priority ?? 100
    }

    const key = buildKey(input.integrationId, input.capability)
    const current = this.routes.get(key) || []
    current.push(route)
    this.routes.set(
      key,
      current.sort((left, right) => {
        const backendPriorityLeft = this.backendOrderByPriority.get(left.adapter.backend) ?? 999
        const backendPriorityRight = this.backendOrderByPriority.get(right.adapter.backend) ?? 999
        if (backendPriorityLeft !== backendPriorityRight) {
          return backendPriorityLeft - backendPriorityRight
        }
        return left.priority - right.priority
      })
    )
  }

  public resolve(
    integrationId: IntegrationId,
    capability: ConnectorCapability,
    preferredBackends?: ConnectorBackend[],
    deniedBackends: ConnectorBackend[] = []
  ): ConnectorCapabilityRoute[] {
    const key = buildKey(integrationId, capability)
    const current = this.routes.get(key) || []
    const deniedSet = new Set(deniedBackends)

    const filtered = current.filter((route) => {
      if (deniedSet.has(route.adapter.backend)) {
        return false
      }
      return route.adapter.supports(route.integrationId, route.capability)
    })

    if (!preferredBackends || preferredBackends.length === 0) {
      return filtered
    }

    const preferredOrder = new Map(preferredBackends.map((backend, index) => [backend, index]))
    return [...filtered].sort((left, right) => {
      const leftPreferred = preferredOrder.get(left.adapter.backend)
      const rightPreferred = preferredOrder.get(right.adapter.backend)
      if (leftPreferred !== undefined && rightPreferred !== undefined) {
        return leftPreferred - rightPreferred
      }
      if (leftPreferred !== undefined) return -1
      if (rightPreferred !== undefined) return 1
      const backendPriorityLeft = this.backendOrderByPriority.get(left.adapter.backend) ?? 999
      const backendPriorityRight = this.backendOrderByPriority.get(right.adapter.backend) ?? 999
      if (backendPriorityLeft !== backendPriorityRight) {
        return backendPriorityLeft - backendPriorityRight
      }
      return left.priority - right.priority
    })
  }

  public listCapabilities(): ConnectorCapabilityRegistration[] {
    const registrationMap = new Map<string, ConnectorCapabilityRegistration>()
    this.routes.forEach((routeList) => {
      if (routeList.length === 0) {
        return
      }

      const first = routeList[0]
      const key = buildKey(first.integrationId, first.capability)
      const backends = Array.from(new Set(routeList.map((route) => route.adapter.backend)))

      registrationMap.set(key, {
        integrationId: first.integrationId,
        capability: first.capability,
        backends,
        sensitivity: routeList.some((route) => route.sensitivity === 'sensitive')
          ? 'sensitive'
          : 'normal',
        description: routeList.find((route) => typeof route.description === 'string')?.description
      })
    })

    return Array.from(registrationMap.values()).sort((left, right) => {
      if (left.integrationId !== right.integrationId) {
        return left.integrationId.localeCompare(right.integrationId)
      }
      return left.capability.localeCompare(right.capability)
    })
  }
}

export type { ConnectorCapabilityRoute }
