import type { IntegrationConfig } from '../types/integration'

// Import all integrations
import postgresqlPostgisConfig from './postgresql-postgis'
import googleEarthEngineConfig from './google-earth-engine'

// Registry of all available integrations
export const integrationRegistry: IntegrationConfig[] = [
  postgresqlPostgisConfig,
  googleEarthEngineConfig
]

// Helper functions for integration management
export const getIntegrationById = (id: string): IntegrationConfig | undefined => {
  return integrationRegistry.find(config => config.integration.id === id)
}

export const getIntegrationsByType = (type: string): IntegrationConfig[] => {
  return integrationRegistry.filter(config => config.integration.type === type)
}

export const getIntegrationsByStatus = (status: string): IntegrationConfig[] => {
  return integrationRegistry.filter(config => config.integration.status === status)
}

export const getIntegrationsByCategory = (category: string): IntegrationConfig[] => {
  return integrationRegistry.filter(config => config.integration.category === category)
}

// Export all integrations for convenience
export * from './postgresql-postgis'
export * from './google-earth-engine'

export default integrationRegistry