import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  registerVisualizationTools: vi.fn(),
  registerMapLayerManagementTools: vi.fn(),
  registerMapViewTools: vi.fn(),
  registerAppUiTools: vi.fn(),
  registerDatabaseTools: vi.fn(),
  registerKnowledgeBaseTools: vi.fn(),
  registerAgentTools: vi.fn(),
  registerIntegrationTools: vi.fn()
}))

vi.mock('./tool-packs/visualization-tool-pack', () => ({
  registerVisualizationTools: mocks.registerVisualizationTools
}))
vi.mock('./tool-packs/map-layer-management-tool-pack', () => ({
  registerMapLayerManagementTools: mocks.registerMapLayerManagementTools
}))
vi.mock('./tool-packs/map-view-tool-pack', () => ({
  registerMapViewTools: mocks.registerMapViewTools
}))
vi.mock('./tool-packs/app-ui-tool-pack', () => ({ registerAppUiTools: mocks.registerAppUiTools }))
vi.mock('./tool-packs/database-tool-pack', () => ({
  registerDatabaseTools: mocks.registerDatabaseTools
}))
vi.mock('./tool-packs/knowledge-base-tool-pack', () => ({
  registerKnowledgeBaseTools: mocks.registerKnowledgeBaseTools
}))
vi.mock('./tool-packs/agent-tool-pack', () => ({ registerAgentTools: mocks.registerAgentTools }))
vi.mock('./tool-packs/integration-tool-pack', () => ({
  registerIntegrationTools: mocks.registerIntegrationTools
}))

import { registerBuiltInTools } from './register-built-in-tools'

describe('registerBuiltInTools', () => {
  it('registers all built-in tool packs with correct dependencies', () => {
    const deps = {
      registry: { register: vi.fn() } as never,
      mapLayerTracker: {} as never,
      getMainWindow: vi.fn(() => null),
      getKnowledgeBaseService: vi.fn(() => null),
      getPostgresqlService: vi.fn(() => null),
      getAgentRegistryService: vi.fn(() => null),
      getOrchestrationService: vi.fn(() => null),
      getConnectorExecutionService: vi.fn(() => null)
    }

    registerBuiltInTools(deps)

    expect(mocks.registerVisualizationTools).toHaveBeenCalledWith(deps.registry, {
      mapLayerTracker: deps.mapLayerTracker
    })
    expect(mocks.registerMapLayerManagementTools).toHaveBeenCalledWith(deps.registry, {
      mapLayerTracker: deps.mapLayerTracker
    })
    expect(mocks.registerMapViewTools).toHaveBeenCalledWith(deps.registry, {
      getMainWindow: deps.getMainWindow
    })
    expect(mocks.registerAppUiTools).toHaveBeenCalledWith(deps.registry, {
      getMainWindow: deps.getMainWindow
    })
    expect(mocks.registerDatabaseTools).toHaveBeenCalledWith(deps.registry, {
      getPostgresqlService: deps.getPostgresqlService
    })
    expect(mocks.registerKnowledgeBaseTools).toHaveBeenCalledWith(deps.registry, {
      getKnowledgeBaseService: deps.getKnowledgeBaseService
    })
    expect(mocks.registerAgentTools).toHaveBeenCalledWith(deps.registry, {
      getAgentRegistryService: deps.getAgentRegistryService,
      getOrchestrationService: deps.getOrchestrationService
    })
    expect(mocks.registerIntegrationTools).toHaveBeenCalledWith(deps.registry, {
      getConnectorExecutionService: deps.getConnectorExecutionService
    })
  })
})
