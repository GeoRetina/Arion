import { McpServerConfig } from '../../../../../shared/ipc-types'

export type ConnectionType = 'stdio' | 'http'

export interface NormalizedConfigResult {
  config: Omit<McpServerConfig, 'id'> | null
  error?: string
}

const trimArgs = (args?: string[]): string[] | undefined => {
  if (!Array.isArray(args)) return args
  const trimmed = args.map((arg) => arg.trim()).filter((arg) => arg.length > 0)
  return trimmed.length > 0 ? trimmed : args
}

export const sanitizeConfig = (
  config: Omit<McpServerConfig, 'id'>,
  connectionType: ConnectionType
): Omit<McpServerConfig, 'id'> => {
  const base: Omit<McpServerConfig, 'id'> = {
    ...config,
    command: config.command?.trim() || '',
    url: config.url?.trim() || '',
    args: trimArgs(config.args)
  }

  if (connectionType === 'stdio') {
    return { ...base, url: '' }
  }

  return { ...base, command: '', args: Array.isArray(base.args) ? base.args : [] }
}

export const buildNormalizedConfig = ({
  editingConfig,
  inputMode,
  jsonString,
  isEditingExistingServer,
  connectionType
}: {
  editingConfig: McpServerConfig | Omit<McpServerConfig, 'id'> | null
  inputMode: 'form' | 'json'
  jsonString: string
  isEditingExistingServer: boolean
  connectionType: ConnectionType
}): NormalizedConfigResult => {
  if (!editingConfig) {
    return { config: null, error: 'No configuration to process.' }
  }

  if (inputMode === 'json') {
    try {
      const parsedJson = JSON.parse(jsonString)
      if (isEditingExistingServer && editingConfig && 'id' in editingConfig) {
        const { id: _id, ...rest } = parsedJson as { id?: string } & Record<string, unknown>
        return { config: sanitizeConfig(rest as Omit<McpServerConfig, 'id'>, connectionType) }
      }
      const { id: _id, ...rest } = parsedJson as { id?: string } & Record<string, unknown>
      return { config: sanitizeConfig(rest as Omit<McpServerConfig, 'id'>, connectionType) }
    } catch {
      return { config: null, error: 'Invalid JSON configuration.' }
    }
  }

  if ('id' in editingConfig) {
    const { id: _id, ...rest } = editingConfig
    return { config: sanitizeConfig(rest, connectionType) }
  }

  return { config: sanitizeConfig(editingConfig, connectionType) }
}
