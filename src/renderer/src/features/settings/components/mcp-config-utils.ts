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

const omitId = (value: Record<string, unknown>): Omit<McpServerConfig, 'id'> => {
  const next = { ...value }
  delete next.id
  return next as Omit<McpServerConfig, 'id'>
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
        return {
          config: sanitizeConfig(omitId(parsedJson as Record<string, unknown>), connectionType)
        }
      }
      return {
        config: sanitizeConfig(omitId(parsedJson as Record<string, unknown>), connectionType)
      }
    } catch {
      return { config: null, error: 'Invalid JSON configuration.' }
    }
  }

  if ('id' in editingConfig) {
    return {
      config: sanitizeConfig(
        omitId(editingConfig as unknown as Record<string, unknown>),
        connectionType
      )
    }
  }

  return { config: sanitizeConfig(editingConfig, connectionType) }
}
