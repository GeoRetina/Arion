import { Database } from 'lucide-react'
import type { Integration, IntegrationConfig } from '../../types/integration'
import { PostgreSQLConfig } from '../../../../shared/ipc-types'

export const postgresqlPostgisIntegration: Integration = {
  id: 'postgresql-postgis',
  name: 'PostgreSQL/PostGIS',
  description: 'Connect to spatial databases for advanced GIS operations',
  type: 'database',
  status: 'disconnected',
  lastUsed: 'Never',
  category: 'Database',
  configurable: true,
  documentation: 'https://postgis.net/docs/',
  connectionSettings: {
    host: 'localhost',
    port: 5432,
    database: '',
    username: '',
    password: '',
    ssl: false
  }
}

export const postgresqlPostgisConfig: IntegrationConfig = {
  integration: postgresqlPostgisIntegration,
  onConnect: async () => {
    console.log('Connecting to PostgreSQL/PostGIS...')
    
    try {
      const config = postgresqlPostgisIntegration.connectionSettings as PostgreSQLConfig
      
      // Validate configuration
      if (!config.host || !config.database || !config.username || !config.password) {
        throw new Error('Missing required connection parameters')
      }
      
      // Create connection using the PostgreSQL service
      const result = await window.ctg.postgresql.createConnection(
        postgresqlPostgisIntegration.id,
        config
      )
      
      if (result.success) {
        postgresqlPostgisIntegration.status = 'connected'
        postgresqlPostgisIntegration.lastUsed = new Date().toLocaleString()
        console.log('Successfully connected to PostgreSQL/PostGIS')
      } else {
        postgresqlPostgisIntegration.status = 'error'
        throw new Error(result.message)
      }
    } catch (error) {
      console.error('Failed to connect to PostgreSQL/PostGIS:', error)
      postgresqlPostgisIntegration.status = 'error'
      throw error
    }
  },
  onDisconnect: async () => {
    console.log('Disconnecting from PostgreSQL/PostGIS...')
    
    try {
      await window.ctg.postgresql.closeConnection(postgresqlPostgisIntegration.id)
      postgresqlPostgisIntegration.status = 'disconnected'
      console.log('Successfully disconnected from PostgreSQL/PostGIS')
    } catch (error) {
      console.error('Failed to disconnect from PostgreSQL/PostGIS:', error)
      throw error
    }
  },
  onConfigure: () => {
    console.log('Configuring PostgreSQL/PostGIS...')
    // This will be handled by the parent component to open the configuration dialog
  },
  onTest: async () => {
    console.log('Testing PostgreSQL/PostGIS connection...')
    
    try {
      const config = postgresqlPostgisIntegration.connectionSettings as PostgreSQLConfig
      
      // Validate configuration
      if (!config.host || !config.database || !config.username || !config.password) {
        throw new Error('Missing required connection parameters')
      }
      
      // Test connection using the PostgreSQL service
      const result = await window.ctg.postgresql.testConnection(config)
      
      if (!result.success) {
        throw new Error(result.message)
      }
      
      return result
    } catch (error) {
      console.error('Failed to test PostgreSQL/PostGIS connection:', error)
      throw error
    }
  }
}

export default postgresqlPostgisConfig