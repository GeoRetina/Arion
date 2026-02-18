import type { PluginDiagnosticEntry, PluginDiagnosticLevel } from '../../../shared/ipc-types'

interface DiagnosticOptions {
  pluginId?: string
  sourcePath?: string
}

export function createDiagnostic(
  level: PluginDiagnosticLevel,
  code: string,
  message: string,
  options: DiagnosticOptions = {}
): PluginDiagnosticEntry {
  return {
    level,
    code,
    message,
    pluginId: options.pluginId,
    sourcePath: options.sourcePath,
    timestamp: new Date().toISOString()
  }
}
