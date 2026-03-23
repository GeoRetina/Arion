import type { ConnectorExecutionErrorCode } from '../connectors/adapters/connector-adapter'
import type { QgisDiscoveredInstallation, QgisDiscoveryStatus } from '../../../shared/ipc-types'
import type { LayerCreateInput } from '../../../shared/types/layer-types'

export type QgisProcessOperation =
  | 'listAlgorithms'
  | 'describeAlgorithm'
  | 'runAlgorithm'
  | 'applyLayerStyle'
  | 'exportLayout'

export type QgisImportPreference = 'none' | 'suggest' | 'auto'

export interface QgisDiscoveryResult {
  status: QgisDiscoveryStatus
  preferredInstallation?: QgisDiscoveredInstallation
  installations: QgisDiscoveredInstallation[]
  diagnostics: string[]
}

export interface QgisArtifactRecord {
  path: string
  kind: 'vector' | 'raster' | 'style' | 'layout' | 'table' | 'other'
  exists: boolean
  imported?: boolean
  importError?: string
}

export interface QgisImportedLayerRecord {
  path: string
  layer: LayerCreateInput
}

export interface QgisExecutionDiagnostics {
  launcherPath: string
  installRoot?: string
  version?: string
  workspacePath: string
  outputDirectory: string
  discoveryDiagnostics: string[]
  stdoutPreview?: string
  stderrPreview?: string
}

export interface QgisProcessSuccessResult {
  success: true
  operation: QgisProcessOperation
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
  version?: string
  artifacts: QgisArtifactRecord[]
  importedLayers: QgisImportedLayerRecord[]
  parsedResult?: unknown
  diagnostics: QgisExecutionDiagnostics
}

export interface QgisProcessFailureResult {
  success: false
  operation: QgisProcessOperation
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
  errorCode: ConnectorExecutionErrorCode
  message: string
  diagnostics?: QgisExecutionDiagnostics
}

export type QgisProcessResult = QgisProcessSuccessResult | QgisProcessFailureResult

export interface QgisListAlgorithmsRequest {
  query?: string
  provider?: string
  limit?: number
  timeoutMs?: number
}

export interface QgisRunAlgorithmRequest {
  algorithmId: string
  parameters?: Record<string, unknown>
  projectPath?: string
  timeoutMs?: number
  importPreference?: QgisImportPreference
  expectedOutputs?: string[]
  chatId?: string
}

export interface QgisApplyLayerStyleRequest {
  inputPath: string
  stylePath: string
  timeoutMs?: number
  chatId?: string
}

export interface QgisExportLayoutRequest {
  projectPath: string
  layoutName: string
  outputPath?: string
  format?: 'pdf' | 'image'
  dpi?: number
  georeference?: boolean
  includeMetadata?: boolean
  antialias?: boolean
  forceVector?: boolean
  forceRaster?: boolean
  timeoutMs?: number
  chatId?: string
}
