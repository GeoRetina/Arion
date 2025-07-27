import { Database } from 'lucide-react'
import type { Integration, IntegrationConfig } from '../../types/integration'

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
    host: '',
    port: 5432,
    database: '',
    username: '',
    password: '',
    ssl: false
  }
}

export const postgresqlPostgisConfig: IntegrationConfig = {
  integration: postgresqlPostgisIntegration,
  onConnect: () => {
    console.log('Connecting to PostgreSQL/PostGIS...')
    // TODO: Implement actual connection logic
  },
  onDisconnect: () => {
    console.log('Disconnecting from PostgreSQL/PostGIS...')
    // TODO: Implement actual disconnection logic
  },
  onConfigure: () => {
    console.log('Configuring PostgreSQL/PostGIS...')
    // TODO: Open configuration dialog
  },
  onTest: () => {
    console.log('Testing PostgreSQL/PostGIS connection...')
    // TODO: Test connection
  }
}

export default postgresqlPostgisConfig