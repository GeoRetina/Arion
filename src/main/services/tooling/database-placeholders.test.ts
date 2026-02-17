import { describe, expect, it } from 'vitest'
import {
  CONNECTION_CREDENTIAL_KEY_PLACEHOLDERS,
  CONNECTION_PLACEHOLDER_LOOKUP,
  CONNECTION_SECURITY_NOTE
} from './database-placeholders'

describe('database placeholder constants', () => {
  it('exposes documented placeholder key names', () => {
    expect(CONNECTION_CREDENTIAL_KEY_PLACEHOLDERS).toEqual({
      host: 'host',
      port: 'port',
      database: 'db_name',
      username: 'username',
      password: 'password',
      ssl: 'ssl'
    })
  })

  it('supports alternate database placeholder aliases', () => {
    expect(CONNECTION_PLACEHOLDER_LOOKUP.database.has('db_name')).toBe(true)
    expect(CONNECTION_PLACEHOLDER_LOOKUP.database.has('database')).toBe(true)
  })

  it('includes a security note about connection_id usage', () => {
    expect(CONNECTION_SECURITY_NOTE).toContain('connection_id')
    expect(CONNECTION_SECURITY_NOTE).toContain('list_database_connections')
  })
})
