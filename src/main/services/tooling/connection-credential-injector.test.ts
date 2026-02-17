import { describe, expect, it, vi } from 'vitest'
import { ConnectionCredentialInjector } from './connection-credential-injector'

describe('ConnectionCredentialInjector', () => {
  it('returns args unchanged for non-object input or missing connection_id', async () => {
    const injector = new ConnectionCredentialInjector()

    expect(await injector.inject(null)).toBeNull()
    expect(await injector.inject('value')).toBe('value')
    expect(await injector.inject({ query: 'select 1' })).toEqual({ query: 'select 1' })
  })

  it('throws when connection_id is provided but service is not configured', async () => {
    const injector = new ConnectionCredentialInjector()

    await expect(injector.inject({ connection_id: 'conn_1' })).rejects.toThrow(
      'PostgreSQL service is not configured'
    )
  })

  it('throws when referenced connection is not active', async () => {
    const injector = new ConnectionCredentialInjector()
    injector.setPostgresqlService({
      getConnectionInfo: vi.fn(async () => ({
        connected: false
      }))
    } as never)

    await expect(injector.inject({ connection_id: 'conn_1' })).rejects.toThrow('is not active')
  })

  it('injects credentials for missing and placeholder fields', async () => {
    const injector = new ConnectionCredentialInjector()
    injector.setPostgresqlService({
      getConnectionInfo: vi.fn(async () => ({
        connected: true,
        config: {
          host: 'localhost',
          port: 5432,
          database: 'gis',
          username: 'admin',
          password: 'secret',
          ssl: true
        }
      }))
    } as never)

    const result = await injector.inject({
      connection_id: 'conn_1',
      host: ' host ',
      port: 'port',
      database: 'DB_NAME',
      username: 'username',
      password: 'password',
      ssl: 'ssl',
      query: 'SELECT 1'
    })

    expect(result).toEqual({
      connection_id: 'conn_1',
      host: 'localhost',
      port: 5432,
      database: 'gis',
      username: 'admin',
      password: 'secret',
      ssl: true,
      query: 'SELECT 1'
    })
  })

  it('does not overwrite explicit non-placeholder values', async () => {
    const injector = new ConnectionCredentialInjector()
    injector.setPostgresqlService({
      getConnectionInfo: vi.fn(async () => ({
        connected: true,
        config: {
          host: 'localhost',
          port: 5432,
          database: 'gis',
          username: 'admin',
          password: 'secret',
          ssl: false
        }
      }))
    } as never)

    const result = await injector.inject({
      connection_id: 'conn_2',
      host: 'remote-host',
      port: 6000
    })

    expect(result.host).toBe('remote-host')
    expect(result.port).toBe(6000)
  })
})
