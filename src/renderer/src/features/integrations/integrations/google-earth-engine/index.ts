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
    console.log('Google Earth Engine integration coming soon...')
    // TODO: Implement when ready
  },
  onDisconnect: () => {
    console.log('Google Earth Engine integration coming soon...')
    // TODO: Implement when ready
  },
  onConfigure: () => {
    console.log('Google Earth Engine integration coming soon...')
    // TODO: Implement when ready
  },
  onTest: () => {
    console.log('Google Earth Engine integration coming soon...')
    // TODO: Implement when ready
  }
}

export default googleEarthEngineConfig