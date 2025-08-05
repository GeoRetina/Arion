import { Layers } from 'lucide-react'
import type { Integration, IntegrationConfig } from '../../types/integration'

export const googleEarthEngineIntegration: Integration = {
  id: 'google-earth-engine',
  name: 'Google Earth Engine',
  description: 'Access and analyze satellite imagery and geospatial datasets',
  type: 'cloud-platform',
  status: 'coming-soon',
  lastUsed: 'Never',
  category: 'Cloud Platform',
  configurable: false, // Not configurable yet since it's coming soon
  documentation: 'https://developers.google.com/earth-engine/',
  connectionSettings: {
    // These will be implemented when the integration is ready
    serviceAccountKey: '',
    projectId: '',
    region: 'us-central1'
  }
}

export const googleEarthEngineConfig: IntegrationConfig = {
  integration: googleEarthEngineIntegration,
  onConnect: () => {
    // TODO: Implement when ready
  },
  onDisconnect: () => {
    // TODO: Implement when ready
  },
  onConfigure: () => {
    // TODO: Implement when ready
  },
  onTest: () => {
    // TODO: Implement when ready
  }
}

export default googleEarthEngineConfig
