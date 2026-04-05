import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import type { PostgreSQLConnectionResult, PostgreSQLConfig } from '../../shared/ipc-types'

const keytarStore = vi.hoisted(() => new Map<string, string>())
const sqliteMocks = vi.hoisted(() => {
  interface StoredIntegrationRow {
    id: string
    status: string
    last_used: string
    message: string | null
    checked_at: string | null
    has_config: number
    public_config: string
  }

  const rowsByDbPath = new Map<string, Map<string, StoredIntegrationRow>>()

  const getRows = (dbPath: string): Map<string, StoredIntegrationRow> => {
    let rows = rowsByDbPath.get(dbPath)
    if (!rows) {
      rows = new Map<string, StoredIntegrationRow>()
      rowsByDbPath.set(dbPath, rows)
    }
    return rows
  }

  const DatabaseMock = vi.fn(function DatabaseMock(this: unknown, dbPath: string) {
    const rows = getRows(dbPath)

    return {
      exec: vi.fn(),
      prepare: vi.fn((sql: string) => {
        if (
          sql ===
          'SELECT id, status, last_used, message, checked_at, has_config, public_config FROM integration_configs'
        ) {
          return {
            all: () => Array.from(rows.values())
          }
        }

        if (
          sql ===
          'SELECT id, status, last_used, message, checked_at, has_config, public_config FROM integration_configs WHERE id = ?'
        ) {
          return {
            get: (id: string) => rows.get(id)
          }
        }

        if (sql.includes('INSERT INTO integration_configs')) {
          return {
            run: (
              id: string,
              status: string,
              lastUsed: string,
              message: string | null,
              checkedAt: string | null,
              hasConfig: number,
              publicConfig: string
            ) => {
              rows.set(id, {
                id,
                status,
                last_used: lastUsed,
                message,
                checked_at: checkedAt,
                has_config: hasConfig,
                public_config: publicConfig
              })
              return { changes: 1 }
            }
          }
        }

        throw new Error(`Unexpected SQL in ConnectorHubService test: ${sql}`)
      }),
      close: vi.fn()
    }
  })

  return {
    DatabaseMock,
    reset: () => {
      rowsByDbPath.clear()
      DatabaseMock.mockClear()
    }
  }
})
const electronMocks = vi.hoisted(() => ({
  getPath: vi.fn(() => os.tmpdir())
}))

vi.mock('electron', () => ({
  app: {
    getPath: electronMocks.getPath
  }
}))

vi.mock('keytar', () => ({
  getPassword: vi.fn(async (service: string, account: string) => {
    return keytarStore.get(`${service}:${account}`) ?? null
  }),
  setPassword: vi.fn(async (service: string, account: string, password: string) => {
    keytarStore.set(`${service}:${account}`, password)
  }),
  deletePassword: vi.fn(async (service: string, account: string) => {
    keytarStore.delete(`${service}:${account}`)
    return true
  })
}))

vi.mock('better-sqlite3', () => ({
  default: sqliteMocks.DatabaseMock
}))

import { ConnectorHubService } from './connector-hub-service'

const postgresConfig: PostgreSQLConfig = {
  host: 'localhost',
  port: 5432,
  database: 'gis',
  username: 'postgres',
  password: 'secret',
  ssl: false
}

const successfulCreateConnection: PostgreSQLConnectionResult = {
  success: true,
  version: 'PostgreSQL 16.2',
  postgisVersion: '3.4.0',
  message: 'Connection pool created successfully'
}

describe('ConnectorHubService runtime connection restore', () => {
  let tempRoot: string

  beforeEach(async () => {
    keytarStore.clear()
    sqliteMocks.reset()
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arion-connector-hub-'))
    electronMocks.getPath.mockReturnValue(tempRoot)
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  it('restores the saved postgres runtime connection before returning states', async () => {
    const initialPostgresqlService = {
      createConnection: vi.fn(async () => successfulCreateConnection),
      restoreConnection: vi.fn()
    }

    const initialHub = new ConnectorHubService(initialPostgresqlService as never)
    await initialHub.connect('postgresql-postgis', postgresConfig)
    initialHub.cleanup()

    const restoredPostgresqlService = {
      restoreConnection: vi.fn(async () => ({
        success: true,
        version: 'PostgreSQL 16.2',
        postgisVersion: '3.4.0',
        message: 'Connection restored successfully'
      }))
    }

    const restoredHub = new ConnectorHubService(restoredPostgresqlService as never)
    const states = await restoredHub.getStates()
    const postgresState = states.find((state) => state.id === 'postgresql-postgis')

    expect(restoredPostgresqlService.restoreConnection).toHaveBeenCalledWith('postgresql-postgis')
    expect(postgresState).toMatchObject({
      id: 'postgresql-postgis',
      status: 'connected',
      hasConfig: true,
      message: 'Connection restored successfully'
    })

    restoredHub.cleanup()
  })

  it('downgrades the saved postgres state when restore fails', async () => {
    const initialPostgresqlService = {
      createConnection: vi.fn(async () => successfulCreateConnection),
      restoreConnection: vi.fn()
    }

    const initialHub = new ConnectorHubService(initialPostgresqlService as never)
    await initialHub.connect('postgresql-postgis', postgresConfig)
    initialHub.cleanup()

    const restoredPostgresqlService = {
      restoreConnection: vi.fn(async () => ({
        success: false,
        message: 'password authentication failed for user "postgres"'
      }))
    }

    const restoredHub = new ConnectorHubService(restoredPostgresqlService as never)
    const states = await restoredHub.getStates()
    const postgresState = states.find((state) => state.id === 'postgresql-postgis')

    expect(restoredPostgresqlService.restoreConnection).toHaveBeenCalledWith('postgresql-postgis')
    expect(postgresState).toMatchObject({
      id: 'postgresql-postgis',
      status: 'error',
      hasConfig: true,
      message: 'password authentication failed for user "postgres"'
    })

    restoredHub.cleanup()
  })
})
