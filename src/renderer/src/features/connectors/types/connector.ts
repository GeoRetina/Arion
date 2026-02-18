import type {
  IntegrationConfig as SharedIntegrationConfig,
  IntegrationId,
  IntegrationStatus
} from '../../../../../shared/ipc-types'

export type IntegrationType = 'api' | 'cloud' | 'database' | 'cloud-platform'

export type IntegrationFieldType = 'text' | 'password' | 'number' | 'url' | 'textarea' | 'boolean'

export interface IntegrationFieldDefinition {
  key: string
  label: string
  type: IntegrationFieldType
  sensitive?: boolean
  required?: boolean
  placeholder?: string
  description?: string
}

export interface Integration {
  id: IntegrationId
  name: string
  description: string
  type: IntegrationType
  status: IntegrationStatus
  lastUsed: string
  icon?: string
  category?: string
  documentation?: string
  configurable?: boolean
  connectionSettings?: SharedIntegrationConfig | null
  message?: string
}

export interface IntegrationDefinition {
  integration: Integration
  fields?: IntegrationFieldDefinition[]
  defaultConnectionSettings?: Record<string, unknown>
}
