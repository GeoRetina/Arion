export type IntegrationStatus = 
  | 'connected'
  | 'disconnected'
  | 'not-configured'
  | 'coming-soon'
  | 'error'

export type IntegrationType = 
  | 'api'
  | 'cloud'
  | 'database'
  | 'cloud-platform'

export interface Integration {
  id: string
  name: string
  description: string
  type: IntegrationType
  status: IntegrationStatus
  lastUsed: string
  icon?: string
  category?: string
  documentation?: string
  configurable?: boolean
  connectionSettings?: Record<string, any>
}

export interface IntegrationConfig {
  integration: Integration
  onConnect?: () => void
  onDisconnect?: () => void
  onConfigure?: () => void
  onTest?: () => void
}