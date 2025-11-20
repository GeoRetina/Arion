import { z } from 'zod'

export const listDatabaseConnectionsToolName = 'list_database_connections'

// No parameters needed - just lists available connections
export const ListDatabaseConnectionsParamsSchema = z.object({})
export type ListDatabaseConnectionsParams = z.infer<typeof ListDatabaseConnectionsParamsSchema>

// Tool definition for Vercel AI SDK
export const listDatabaseConnectionsToolDefinition = {
  description:
    '**IMPORTANT: Use this tool FIRST before any database operations!** Lists all configured PostgreSQL database connections that are currently active in Arion. This is an internal discovery step to learn which databases are available; it does not by itself connect or authorize queries. Returns connection IDs that you MUST use with other database tools that may be available to you. Credential values are never exposed; only placeholder key names are returned. Provide only the connection_id (and key names if requested) to other tools and Arion will inject the real secrets automatically.',
  inputSchema: ListDatabaseConnectionsParamsSchema
}

export interface ListDatabaseConnectionsResult {
  status: 'success' | 'error'
  connections?: Array<{
    id: string
    name: string
    host: string
    port: string
    database: string
    username: string
    password: string
    ssl: string
    connected: boolean
  }>
  message: string
  placeholder_note?: string
}
