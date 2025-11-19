export const CONNECTION_CREDENTIAL_KEY_PLACEHOLDERS = {
  host: 'host',
  port: 'port',
  database: 'db_name',
  username: 'username',
  password: 'password',
  ssl: 'ssl'
} as const

export const CONNECTION_PLACEHOLDER_LOOKUP: Record<
  keyof typeof CONNECTION_CREDENTIAL_KEY_PLACEHOLDERS,
  Set<string>
> = {
  host: new Set(['host']),
  port: new Set(['port']),
  database: new Set(['database']),
  username: new Set(['username']),
  password: new Set(['password']),
  ssl: new Set(['ssl'])
}

export const CONNECTION_SECURITY_NOTE =
  "SECURITY: If this tool requires a 'connection_id', never include raw credentials. Use 'list_database_connections' to obtain the connection_id and placeholder key names - Arion injects the actual secrets automatically."
