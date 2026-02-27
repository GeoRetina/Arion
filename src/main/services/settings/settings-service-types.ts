import type { McpServerConfig } from '../../../shared/ipc-types'

export interface StoredLLMConfig {
  model?: string | null
  endpoint?: string | null
  deploymentName?: string | null
  project?: string | null
  location?: string | null
  baseURL?: string | null
}

export interface McpServerConfigRow {
  id: string
  name: string
  url: string | null
  command: string | null
  args: string | null
  enabled: number
}

export const mapMcpRowToConfig = (row: McpServerConfigRow): McpServerConfig => ({
  id: row.id,
  name: row.name,
  url: row.url ?? undefined,
  command: row.command ?? undefined,
  args: row.args ? (JSON.parse(row.args) as string[]) : undefined,
  enabled: row.enabled === 1
})
