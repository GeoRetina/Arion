import type { ToolRegistry } from './tool-registry'
import type { MapLayerTracker } from './map-layer-tracker'
import type { BrowserWindowProvider } from './browser-window-provider'
import type { KnowledgeBaseService } from '../knowledge-base-service'
import type { PostgreSQLService } from '../postgresql-service'
import type { AgentRegistryService } from '../agent-registry-service'
import type { OrchestrationService } from '../orchestration-service'
import { registerVisualizationTools } from './tool-packs/visualization-tool-pack'
import { registerMapLayerManagementTools } from './tool-packs/map-layer-management-tool-pack'
import { registerMapViewTools } from './tool-packs/map-view-tool-pack'
import { registerAppUiTools } from './tool-packs/app-ui-tool-pack'
import { registerDatabaseTools } from './tool-packs/database-tool-pack'
import { registerKnowledgeBaseTools } from './tool-packs/knowledge-base-tool-pack'
import { registerAgentTools } from './tool-packs/agent-tool-pack'

export interface BuiltInRegistrationDeps {
  registry: ToolRegistry
  mapLayerTracker: MapLayerTracker
  getMainWindow: BrowserWindowProvider
  getKnowledgeBaseService: () => KnowledgeBaseService | null
  getPostgresqlService: () => PostgreSQLService | null
  getAgentRegistryService: () => AgentRegistryService | null
  getOrchestrationService: () => OrchestrationService | null
}

export function registerBuiltInTools(deps: BuiltInRegistrationDeps) {
  registerVisualizationTools(deps.registry, {
    mapLayerTracker: deps.mapLayerTracker
  })

  registerMapLayerManagementTools(deps.registry, {
    mapLayerTracker: deps.mapLayerTracker
  })

  registerMapViewTools(deps.registry, {
    getMainWindow: deps.getMainWindow
  })

  registerAppUiTools(deps.registry, {
    getMainWindow: deps.getMainWindow
  })

  registerDatabaseTools(deps.registry, {
    getPostgresqlService: deps.getPostgresqlService
  })

  registerKnowledgeBaseTools(deps.registry, {
    getKnowledgeBaseService: deps.getKnowledgeBaseService
  })

  registerAgentTools(deps.registry, {
    getAgentRegistryService: deps.getAgentRegistryService,
    getOrchestrationService: deps.getOrchestrationService
  })
}
