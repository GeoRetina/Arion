import { randomUUID } from 'crypto'
import { promises as fs, statSync } from 'fs'
import path from 'path'
import { app, BrowserWindow } from 'electron'
import {
  IpcChannels,
  type LayerImportDefinitionsPayload,
  type QgisIntegrationConfig
} from '../../../shared/ipc-types'
import {
  ensureLocalFilesystemPath,
  isNetworkPath,
  isPathInsideDirectory,
  looksLikeFilesystemPath
} from '../../security/path-security'
import { omitUndefined } from '../../lib/omit-undefined'
import type { ConnectorHubService } from '../connector-hub-service'
import { LocalLayerImportService } from '../layers/local-layer-import-service'
import { normalizeQgisAlgorithmList } from './qgis-algorithm-list'
import { evaluateQgisAlgorithmApproval } from './qgis-algorithm-policy'
import { runQgisLauncherCommand } from './qgis-command-runner'
import { QgisAlgorithmCatalogService } from './qgis-algorithm-catalog-service'
import { QgisDiscoveryService } from './qgis-discovery-service'
import { selectQgisArtifactsForImport } from './qgis-import-selection'
import { QgisOutputInspector } from './qgis-output-inspector'
import { normalizeQgisSearchText, tokenizeQgisSearchText } from './qgis-search-text'
import type {
  QgisApplyLayerStyleRequest,
  QgisArtifactRecord,
  QgisExecutionDiagnostics,
  QgisExportLayoutRequest,
  QgisImportedLayerRecord,
  QgisImportPreference,
  QgisListAlgorithmsRequest,
  QgisProcessFailureResult,
  QgisProcessOperation,
  QgisProcessResult,
  QgisRunAlgorithmRequest
} from './types'

const DEFAULT_QGIS_TIMEOUT_MS = 60_000
const MAX_STDIO_PREVIEW_LENGTH = 4_000
const MAX_ACTIVE_WORKFLOWS = 64
const OUTPUT_KEY_PATTERN = /(output|destination|dest|file)$/i
const ARTIFACT_REFERENCE_PREFIX = 'artifact:'

interface PreparedWorkspace {
  workflowId?: string
  workspacePath: string
  outputDirectory: string
}

interface QgisWorkflowState extends PreparedWorkspace {
  workflowId: string
  chatId?: string
  artifactIdToPath: Map<string, string>
  artifactPathToId: Map<string, string>
  nextArtifactOrdinal: number
  lastAccessedAt: number
}

interface QgisPathResolutionContext {
  outputDirectory: string
  workflow?: QgisWorkflowState
}

interface QgisProcessServiceDeps {
  connectorHubService: Pick<ConnectorHubService, 'getConfig'>
  algorithmCatalogService?: Pick<QgisAlgorithmCatalogService, 'rankAlgorithms' | 'warmCatalog'>
  discoveryService?: QgisDiscoveryService
  localLayerImportService?: LocalLayerImportService
  outputInspector?: QgisOutputInspector
  getUserDataPath?: () => string
  broadcastLayerImports?: (payload: LayerImportDefinitionsPayload) => void
}

export class QgisProcessService {
  private readonly algorithmCatalogService: Pick<
    QgisAlgorithmCatalogService,
    'rankAlgorithms' | 'warmCatalog'
  >
  private readonly discoveryService: QgisDiscoveryService
  private readonly localLayerImportService: LocalLayerImportService
  private readonly outputInspector: QgisOutputInspector
  private readonly getUserDataPath: () => string
  private readonly broadcastLayerImports: (payload: LayerImportDefinitionsPayload) => void
  private readonly workflows = new Map<string, QgisWorkflowState>()

  constructor(private readonly deps: QgisProcessServiceDeps) {
    this.algorithmCatalogService = deps.algorithmCatalogService ?? new QgisAlgorithmCatalogService()
    this.discoveryService = deps.discoveryService ?? new QgisDiscoveryService()
    this.localLayerImportService = deps.localLayerImportService ?? new LocalLayerImportService()
    this.outputInspector = deps.outputInspector ?? new QgisOutputInspector()
    this.getUserDataPath = deps.getUserDataPath ?? (() => app.getPath('userData'))
    this.broadcastLayerImports = deps.broadcastLayerImports ?? defaultBroadcastLayerImports
  }

  public async listAlgorithms(options: QgisListAlgorithmsRequest = {}): Promise<QgisProcessResult> {
    const config = await this.getConfig()
    const result = await this.executeLauncherCommand({
      operation: 'listAlgorithms',
      args: ['--json', ...this.buildPluginFlags(config), 'list'],
      timeoutMs: options.timeoutMs
    })

    if (!result.success) {
      return result
    }

    const rawAlgorithms = normalizeQgisAlgorithmList(result.parsedResult, result.stdout, {
      allowPluginAlgorithms: config?.allowPluginAlgorithms === true
    })
    const catalogResult = await this.algorithmCatalogService
      .rankAlgorithms({
        algorithms: rawAlgorithms.algorithms,
        query: options.query,
        provider: options.provider,
        limit: options.limit,
        timeoutMs: options.timeoutMs,
        launcherPath: result.diagnostics.launcherPath,
        version: result.version,
        allowPluginAlgorithms: config?.allowPluginAlgorithms
      })
      .catch(() => null)

    return {
      ...result,
      parsedResult: catalogResult ?? filterAlgorithmList(rawAlgorithms, options)
    }
  }

  public async describeAlgorithm(
    algorithmId: string,
    options: {
      timeoutMs?: number
    } = {}
  ): Promise<QgisProcessResult> {
    if (!isQgisAlgorithmIdentifier(algorithmId)) {
      return buildQgisFailureResult('describeAlgorithm', 'VALIDATION_FAILED', {
        message: `Invalid QGIS algorithm id "${algorithmId}".`
      })
    }

    return await this.executeLauncherCommand({
      operation: 'describeAlgorithm',
      args: ['--json', ...this.buildPluginFlags(await this.getConfig()), 'help', algorithmId],
      timeoutMs: options.timeoutMs
    })
  }

  public async runAlgorithm(request: QgisRunAlgorithmRequest): Promise<QgisProcessResult> {
    return await this.runPreparedAlgorithm(request)
  }

  public async applyLayerStyle(request: QgisApplyLayerStyleRequest): Promise<QgisProcessResult> {
    const normalizedInputPath = normalizeOptionalExistingLocalPath(request.inputPath, 'Layer input')
    if (!normalizedInputPath) {
      return buildQgisFailureResult('applyLayerStyle', 'VALIDATION_FAILED', {
        message: 'inputPath must point to a readable local layer file.'
      })
    }

    const normalizedStylePath = normalizeOptionalExistingLocalPath(request.stylePath, 'Style file')
    if (!normalizedStylePath) {
      return buildQgisFailureResult('applyLayerStyle', 'VALIDATION_FAILED', {
        message: 'stylePath must point to a readable local style file.'
      })
    }

    return await this.runPreparedAlgorithm({
      algorithmId: 'native:setlayerstyle',
      parameters: {
        INPUT: normalizedInputPath,
        STYLE: normalizedStylePath
      },
      chatId: request.chatId,
      timeoutMs: request.timeoutMs,
      importPreference: 'none',
      expectedOutputs: []
    })
  }

  public async exportLayout(request: QgisExportLayoutRequest): Promise<QgisProcessResult> {
    const normalizedProjectPath = normalizeOptionalExistingLocalPath(
      request.projectPath,
      'QGIS project'
    )
    if (!normalizedProjectPath) {
      return buildQgisFailureResult('exportLayout', 'VALIDATION_FAILED', {
        message: 'projectPath must point to a readable local QGIS project file.'
      })
    }

    const workspace = await this.createWorkspace('layout', request.chatId)
    const format = normalizeLayoutFormat(request.format, request.outputPath)
    if (!format) {
      return buildQgisFailureResult('exportLayout', 'VALIDATION_FAILED', {
        message: 'Layout exports must use either PDF or image output formats.'
      })
    }

    let outputPath: string
    try {
      outputPath = resolveOutputPath(
        request.outputPath ||
          `${sanitizeFileName(request.layoutName)}.${format === 'pdf' ? 'pdf' : 'png'}`,
        workspace.outputDirectory,
        'Layout output'
      )
    } catch (error) {
      return buildQgisFailureResult('exportLayout', 'VALIDATION_FAILED', {
        message: error instanceof Error ? error.message : 'Invalid layout output path'
      })
    }

    const algorithmId = format === 'pdf' ? 'native:printlayouttopdf' : 'native:printlayouttoimage'
    const parameters: Record<string, unknown> = omitUndefined({
      LAYOUT: request.layoutName,
      OUTPUT: outputPath,
      DPI: request.dpi,
      GEOREFERENCE: request.georeference,
      INCLUDE_METADATA: request.includeMetadata,
      ANTIALIAS: format === 'image' ? request.antialias : undefined,
      FORCE_VECTOR: format === 'pdf' ? request.forceVector : undefined,
      FORCE_RASTER: format === 'pdf' ? request.forceRaster : undefined
    })

    return await this.runPreparedAlgorithm(
      {
        algorithmId,
        parameters,
        projectPath: normalizedProjectPath,
        timeoutMs: request.timeoutMs,
        importPreference: 'none',
        expectedOutputs: [outputPath],
        chatId: request.chatId
      },
      workspace
    )
  }

  private async runPreparedAlgorithm(
    request: QgisRunAlgorithmRequest,
    workspace?: PreparedWorkspace
  ): Promise<QgisProcessResult> {
    if (!isQgisAlgorithmIdentifier(request.algorithmId)) {
      return buildQgisFailureResult('runAlgorithm', 'VALIDATION_FAILED', {
        message: `Invalid QGIS algorithm id "${request.algorithmId}".`
      })
    }

    const config = await this.getConfig()
    const approvalDecision = evaluateQgisAlgorithmApproval(request.algorithmId, {
      allowPluginAlgorithms: config?.allowPluginAlgorithms
    })
    if (!approvalDecision.allowed) {
      return buildQgisFailureResult(
        'runAlgorithm',
        approvalDecision.errorCode || 'UNSUPPORTED_ALGORITHM',
        {
          message:
            approvalDecision.message || `QGIS algorithm "${request.algorithmId}" is not allowed.`
        }
      )
    }

    let preparedWorkspace: PreparedWorkspace
    try {
      preparedWorkspace =
        workspace ?? (await this.getOrCreateRunWorkspace(request.workflowId, request.chatId))
    } catch (error) {
      return buildQgisFailureResult('runAlgorithm', 'VALIDATION_FAILED', {
        message: error instanceof Error ? error.message : 'Invalid QGIS workflow state'
      })
    }

    const pathResolutionContext: QgisPathResolutionContext = {
      outputDirectory: preparedWorkspace.outputDirectory,
      workflow: isWorkflowState(preparedWorkspace) ? preparedWorkspace : undefined
    }
    const normalizedProjectPath = normalizeOptionalExistingLocalPath(
      request.projectPath,
      'QGIS project'
    )
    if (request.projectPath && !normalizedProjectPath) {
      return buildQgisFailureResult('runAlgorithm', 'VALIDATION_FAILED', {
        message: `Project path "${request.projectPath}" must point to a readable local file.`
      })
    }

    let normalizedParameters: Record<string, unknown>
    let normalizedExpectedOutputs: string[] | undefined
    let normalizedOutputsToImport: string[] | undefined
    try {
      normalizedParameters = await normalizeAlgorithmParameters(
        request.parameters || {},
        pathResolutionContext
      )
      normalizedExpectedOutputs = normalizeExpectedOutputPaths(
        request.expectedOutputs,
        pathResolutionContext
      )
      normalizedOutputsToImport = normalizeRequestedImportPaths(
        request.outputsToImport,
        pathResolutionContext
      )
    } catch (error) {
      return buildQgisFailureResult('runAlgorithm', 'VALIDATION_FAILED', {
        message: error instanceof Error ? error.message : 'Invalid QGIS parameters'
      })
    }

    const executionResult = await this.executeLauncherCommand({
      operation: 'runAlgorithm',
      args: ['--json', ...this.buildPluginFlags(config), 'run', request.algorithmId, '-'],
      timeoutMs: request.timeoutMs ?? config?.timeoutMs,
      stdin: JSON.stringify(
        omitUndefined({
          project_path: normalizedProjectPath,
          inputs: normalizedParameters
        })
      ),
      workspace: preparedWorkspace,
      algorithmId: request.algorithmId,
      importPreference: request.importPreference ?? 'auto',
      expectedOutputs: normalizedExpectedOutputs,
      outputsToImport: normalizedOutputsToImport,
      chatId: request.chatId,
      parameterSnapshot: normalizedParameters
    })

    return executionResult
  }

  private async executeLauncherCommand(input: {
    operation: QgisProcessOperation
    args: string[]
    timeoutMs?: number
    stdin?: string
    workspace?: PreparedWorkspace
    algorithmId?: string
    expectedOutputs?: string[]
    outputsToImport?: string[]
    importPreference?: QgisImportPreference
    chatId?: string
    parameterSnapshot?: Record<string, unknown>
  }): Promise<QgisProcessResult> {
    const config = await this.getConfig()
    const discovery = await this.discoveryService.discover(config)
    const installation = discovery.preferredInstallation
    if (!installation) {
      return buildQgisFailureResult(input.operation, 'NOT_CONFIGURED', {
        message: 'QGIS is not configured or no verified qgis_process launcher was found.'
      })
    }

    const workspace = input.workspace ?? (await this.createWorkspace(input.operation, input.chatId))
    const timeoutMs = Math.max(
      1_000,
      input.timeoutMs ?? config?.timeoutMs ?? DEFAULT_QGIS_TIMEOUT_MS
    )

    try {
      const execution = await runQgisLauncherCommand({
        launcherPath: installation.launcherPath,
        args: input.args,
        cwd: workspace.workspacePath,
        timeoutMs,
        stdin: input.stdin,
        env: {
          ...process.env,
          QT_QPA_PLATFORM: process.env['QT_QPA_PLATFORM'] || 'offscreen'
        }
      })

      const diagnostics = buildDiagnostics({
        launcherPath: installation.launcherPath,
        installRoot: installation.installRoot,
        version: installation.version,
        workflowId: workspace.workflowId,
        workspacePath: workspace.workspacePath,
        outputDirectory: workspace.outputDirectory,
        discoveryDiagnostics: [...discovery.diagnostics, ...installation.diagnostics],
        stdout: execution.stdout,
        stderr: execution.stderr
      })

      if (execution.exitCode !== 0) {
        return {
          success: false,
          operation: input.operation,
          stdout: execution.stdout,
          stderr: execution.stderr,
          exitCode: execution.exitCode,
          durationMs: execution.durationMs,
          errorCode: 'EXECUTION_FAILED',
          message: summarizeCommandFailure(execution.stderr, execution.stdout),
          diagnostics
        }
      }

      const parsedResult = safeParseJson(execution.stdout)
      const artifactPaths = collectArtifactPaths({
        parsedResult,
        expectedOutputs: input.expectedOutputs || [],
        parameterSnapshot: input.parameterSnapshot || {}
      })

      const resolvedArtifacts = await resolveArtifacts({
        paths: artifactPaths,
        workspace
      })
      const { artifacts, artifactsToImport } = selectQgisArtifactsForImport({
        artifacts: resolvedArtifacts,
        importPreference: input.importPreference,
        outputsToImport: input.outputsToImport
      })
      const importedLayers =
        input.importPreference === 'auto'
          ? await this.importArtifacts(artifactsToImport, input.chatId)
          : []
      const outputs = await this.outputInspector.summarizeArtifacts(artifacts, importedLayers)

      if (input.importPreference === 'auto' && importedLayers.length > 0) {
        this.broadcastLayerImports({
          chatId: input.chatId,
          source: 'qgis',
          runId: randomUUID(),
          layers: importedLayers.map((entry) => entry.layer)
        })
      }

      const normalizedResult = normalizeProcessResult(input.operation, {
        algorithmId: input.algorithmId,
        stdout: execution.stdout,
        parsedResult,
        artifacts
      })

      return {
        success: true,
        operation: input.operation,
        workflowId: workspace.workflowId,
        stdout: execution.stdout,
        stderr: execution.stderr,
        exitCode: execution.exitCode,
        durationMs: execution.durationMs,
        version: installation.version,
        artifacts,
        importedLayers,
        outputs,
        parsedResult: normalizedResult,
        diagnostics
      }
    } catch (error) {
      return {
        success: false,
        operation: input.operation,
        stdout: '',
        stderr: '',
        exitCode: -1,
        durationMs: 0,
        errorCode:
          error instanceof Error && /timed out/i.test(error.message)
            ? 'TIMEOUT'
            : 'EXECUTION_FAILED',
        message:
          error instanceof Error ? error.message : 'Failed to execute the QGIS process launcher.'
      }
    }
  }

  private async importArtifacts(
    artifacts: QgisArtifactRecord[],
    chatId?: string
  ): Promise<QgisImportedLayerRecord[]> {
    const importedLayers: QgisImportedLayerRecord[] = []

    for (const artifact of artifacts) {
      if (!artifact.exists || !['vector', 'raster'].includes(artifact.kind)) {
        continue
      }

      try {
        const layer = await this.localLayerImportService.importPath(artifact.path)
        importedLayers.push({
          path: artifact.path,
          layer
        })
        artifact.imported = true
      } catch (error) {
        artifact.importError = error instanceof Error ? error.message : String(error)
      }
    }

    void chatId
    return importedLayers
  }

  private buildPluginFlags(config: QgisIntegrationConfig | null): string[] {
    return config?.allowPluginAlgorithms === true ? [] : ['--skip-loading-plugins']
  }

  private async getConfig(): Promise<QgisIntegrationConfig | null> {
    return (await this.deps.connectorHubService.getConfig('qgis')) as QgisIntegrationConfig | null
  }

  private async getOrCreateRunWorkspace(
    workflowId: string | undefined,
    chatId?: string
  ): Promise<QgisWorkflowState> {
    if (workflowId) {
      const workflow = this.workflows.get(workflowId)
      if (!workflow) {
        throw new Error(
          `Unknown QGIS workflowId "${workflowId}". Start a new workflow by omitting workflowId, then reuse the returned workflowId.`
        )
      }
      return this.touchWorkflow(workflow)
    }

    const workflow = await this.createWorkflowWorkspace('run', chatId)
    this.workflows.set(workflow.workflowId, workflow)
    this.pruneWorkflowCache(workflow.workflowId)
    return workflow
  }

  private async createWorkflowWorkspace(
    operation: string,
    chatId?: string
  ): Promise<QgisWorkflowState> {
    const workspace = await this.createWorkspace(operation, chatId)
    return {
      ...workspace,
      workflowId: randomUUID(),
      chatId,
      artifactIdToPath: new Map<string, string>(),
      artifactPathToId: new Map<string, string>(),
      nextArtifactOrdinal: 1,
      lastAccessedAt: Date.now()
    }
  }

  public clearWorkflowsForChat(chatId: string): void {
    const normalizedChatId = chatId.trim()
    if (!normalizedChatId) {
      return
    }

    for (const [workflowId, workflow] of this.workflows.entries()) {
      if (workflow.chatId === normalizedChatId) {
        this.workflows.delete(workflowId)
      }
    }
  }

  public clearAllWorkflows(): void {
    this.workflows.clear()
  }

  private touchWorkflow(workflow: QgisWorkflowState): QgisWorkflowState {
    workflow.lastAccessedAt = Date.now()
    return workflow
  }

  private pruneWorkflowCache(excludedWorkflowId?: string): void {
    if (this.workflows.size <= MAX_ACTIVE_WORKFLOWS) {
      return
    }

    const overflowCount = this.workflows.size - MAX_ACTIVE_WORKFLOWS
    const evictionCandidates = Array.from(this.workflows.values())
      .filter((workflow) => workflow.workflowId !== excludedWorkflowId)
      .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt)

    for (const workflow of evictionCandidates.slice(0, overflowCount)) {
      this.workflows.delete(workflow.workflowId)
    }
  }

  private async createWorkspace(operation: string, chatId?: string): Promise<PreparedWorkspace> {
    const safeChatId = sanitizeFileName(chatId || 'global')
    const safeOperation = sanitizeFileName(operation)
    const workspacePath = path.join(
      this.getUserDataPath(),
      'qgis-runs',
      safeChatId,
      `${safeOperation}-${randomUUID()}`
    )

    const outputDirectory = path.join(workspacePath, 'outputs')
    await fs.mkdir(outputDirectory, { recursive: true })

    return {
      workspacePath,
      outputDirectory
    }
  }
}

function buildDiagnostics(input: {
  launcherPath: string
  installRoot?: string
  version?: string
  workflowId?: string
  workspacePath: string
  outputDirectory: string
  discoveryDiagnostics: string[]
  stdout: string
  stderr: string
}): QgisExecutionDiagnostics {
  return omitUndefined({
    launcherPath: input.launcherPath,
    installRoot: input.installRoot,
    version: input.version,
    workflowId: input.workflowId,
    workspacePath: input.workspacePath,
    outputDirectory: input.outputDirectory,
    discoveryDiagnostics: input.discoveryDiagnostics,
    stdoutPreview: limitText(input.stdout),
    stderrPreview: limitText(input.stderr)
  })
}

function buildQgisFailureResult(
  operation: QgisProcessOperation,
  errorCode: QgisProcessFailureResult['errorCode'],
  input: {
    message: string
  }
): QgisProcessFailureResult {
  return {
    success: false,
    operation,
    stdout: '',
    stderr: '',
    exitCode: -1,
    durationMs: 0,
    errorCode,
    message: input.message
  }
}

async function normalizeAlgorithmParameters(
  value: Record<string, unknown>,
  context: QgisPathResolutionContext
): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    Object.entries(value).map(async ([key, entryValue]) => [
      key,
      await normalizeParameterValue(key, entryValue, context)
    ])
  )

  return Object.fromEntries(entries)
}

function normalizeExpectedOutputPaths(
  values: string[] | undefined,
  context: QgisPathResolutionContext
): string[] | undefined {
  return normalizeRequestedPaths(values, context, 'Expected output path', false)
}

function normalizeRequestedImportPaths(
  values: string[] | undefined,
  context: QgisPathResolutionContext
): string[] | undefined {
  return normalizeRequestedPaths(values, context, 'Output import path', true)
}

function normalizeRequestedPaths(
  values: string[] | undefined,
  context: QgisPathResolutionContext,
  label: string,
  allowArtifactReference: boolean
): string[] | undefined {
  if (!Array.isArray(values) || values.length === 0) {
    return undefined
  }

  const normalizedPaths = Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .map((value) => normalizeRequestedPathValue(value, context, label, allowArtifactReference))
    )
  )

  return normalizedPaths.length > 0 ? normalizedPaths : undefined
}

function normalizeRequestedPathValue(
  value: string,
  context: QgisPathResolutionContext,
  label: string,
  allowArtifactReference: boolean
): string {
  const artifactPath = resolveArtifactReference(value, context.workflow)
  if (artifactPath) {
    if (!allowArtifactReference) {
      throw new Error(`${label} must not use an artifact reference`)
    }
    return artifactPath
  }

  return resolveOutputPath(value, context.outputDirectory, label)
}

async function normalizeParameterValue(
  key: string,
  value: unknown,
  context: QgisPathResolutionContext
): Promise<unknown> {
  if (Array.isArray(value)) {
    return await Promise.all(
      value.map(
        async (entry, index) => await normalizeParameterValue(`${key}_${index}`, entry, context)
      )
    )
  }

  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value as Record<string, unknown>).map(async ([childKey, childValue]) => [
        childKey,
        await normalizeParameterValue(childKey, childValue, context)
      ])
    )
    return Object.fromEntries(entries)
  }

  if (typeof value !== 'string') {
    return value
  }

  const trimmedValue = value.trim()
  if (trimmedValue.length === 0 || trimmedValue === 'TEMPORARY_OUTPUT') {
    return trimmedValue
  }

  const isOutputKey = OUTPUT_KEY_PATTERN.test(key)
  const artifactPath = resolveArtifactReference(trimmedValue, context.workflow)
  if (artifactPath) {
    if (isOutputKey) {
      throw new Error(
        `${key} must use a managed output path or relative output name, not an artifact reference`
      )
    }
    return artifactPath
  }

  if (looksLikeFilesystemPath(trimmedValue)) {
    const normalizedLocalPath = ensureLocalFilesystemPath(trimmedValue, `${key} path`)
    const exists = await fs
      .stat(normalizedLocalPath)
      .then((stats) => stats.isFile())
      .catch(() => false)

    if (exists) {
      if (isNetworkPath(normalizedLocalPath)) {
        throw new Error(`${key} must use a local filesystem path`)
      }
      return normalizedLocalPath
    }

    if (isOutputKey) {
      return resolveOutputPath(normalizedLocalPath, context.outputDirectory, key)
    }

    throw new Error(`${key} must point to an existing local file`)
  }

  if (isOutputKey) {
    return resolveOutputPath(trimmedValue, context.outputDirectory, key)
  }

  return trimmedValue
}

function resolveOutputPath(value: string, outputDirectory: string, label: string): string {
  if (isNetworkPath(value)) {
    throw new Error(`${label} must use a local filesystem path`)
  }

  const resolvedPath = looksLikeFilesystemPath(value)
    ? ensureLocalFilesystemPath(value, label)
    : path.resolve(outputDirectory, value)

  if (!isPathInsideDirectory(path.dirname(resolvedPath), outputDirectory)) {
    throw new Error(`${label} must stay within the managed QGIS output workspace`)
  }

  return resolvedPath
}

function normalizeOptionalExistingLocalPath(
  value: string | undefined,
  label: string
): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  try {
    const resolvedPath = ensureLocalFilesystemPath(value, label)
    return statSync(resolvedPath).isFile() ? resolvedPath : null
  } catch {
    return null
  }
}

function resolveArtifactReference(
  value: string,
  workflow: QgisWorkflowState | undefined
): string | null {
  const artifactId = parseArtifactReference(value)
  if (!artifactId) {
    return null
  }

  if (!workflow) {
    throw new Error(
      `Artifact reference "${artifactId}" requires a workflowId from a previous qgis_run_processing step`
    )
  }

  const artifactPath = workflow.artifactIdToPath.get(artifactId)
  if (!artifactPath) {
    throw new Error(
      `Unknown QGIS artifact "${artifactId}" for workflow "${workflow.workflowId}". Reuse an artifactId returned by an earlier step in the same workflow.`
    )
  }

  return artifactPath
}

function parseArtifactReference(value: string): string | null {
  const trimmedValue = value.trim()
  if (!trimmedValue.toLowerCase().startsWith(ARTIFACT_REFERENCE_PREFIX)) {
    return null
  }

  const artifactId = trimmedValue.slice(ARTIFACT_REFERENCE_PREFIX.length).replace(/^\/+/u, '')
  return artifactId.trim().length > 0 ? artifactId.trim() : null
}

function collectArtifactPaths(input: {
  parsedResult: unknown
  expectedOutputs: string[]
  parameterSnapshot: Record<string, unknown>
}): string[] {
  const candidates = new Set<string>()
  for (const expectedOutput of input.expectedOutputs) {
    if (typeof expectedOutput === 'string' && expectedOutput.trim().length > 0) {
      candidates.add(expectedOutput.trim())
    }
  }

  collectOutputPathsFromNamedObject(input.parameterSnapshot, candidates)
  collectResultArtifactPaths(input.parsedResult, candidates)

  return Array.from(candidates.values())
}

async function resolveArtifacts(input: {
  paths: string[]
  workspace: PreparedWorkspace
}): Promise<QgisArtifactRecord[]> {
  const artifacts: QgisArtifactRecord[] = []
  for (const candidatePath of input.paths) {
    const normalizedPath = normalizeArtifactPath(candidatePath)
    if (!normalizedPath) {
      continue
    }

    const workflow = isWorkflowState(input.workspace) ? input.workspace : undefined
    const exists = await fs
      .stat(normalizedPath)
      .then((stats) => stats.isFile())
      .catch(() => false)
    const relativePath = toRelativeOutputPath(normalizedPath, input.workspace.outputDirectory)
    const artifactId = workflow
      ? registerWorkflowArtifact(workflow, normalizedPath, relativePath)
      : undefined

    artifacts.push(
      omitUndefined({
        path: normalizedPath,
        workflowId: input.workspace.workflowId,
        artifactId,
        relativePath,
        kind: classifyArtifactKind(normalizedPath),
        exists
      })
    )
  }

  return artifacts
}

function normalizeArtifactPath(value: string): string | null {
  const trimmedValue = value.trim()
  if (trimmedValue.length === 0 || trimmedValue === 'TEMPORARY_OUTPUT') {
    return null
  }

  if (!looksLikeFilesystemPath(trimmedValue)) {
    return null
  }

  try {
    return ensureLocalFilesystemPath(trimmedValue, 'QGIS artifact path')
  } catch {
    return null
  }
}

function toRelativeOutputPath(artifactPath: string, outputDirectory: string): string | undefined {
  if (!isPathInsideDirectory(path.dirname(artifactPath), outputDirectory)) {
    return undefined
  }

  const relativePath = path.relative(outputDirectory, artifactPath)
  if (!relativePath || relativePath.startsWith('..')) {
    return undefined
  }

  return relativePath.replace(/[\\/]+/g, '/')
}

function registerWorkflowArtifact(
  workflow: QgisWorkflowState,
  artifactPath: string,
  relativePath?: string
): string {
  const existingArtifactId = workflow.artifactPathToId.get(toPathLookupKey(artifactPath))
  if (existingArtifactId) {
    return existingArtifactId
  }

  const artifactId = createWorkflowArtifactId(workflow, artifactPath, relativePath)
  workflow.artifactIdToPath.set(artifactId, artifactPath)
  workflow.artifactPathToId.set(toPathLookupKey(artifactPath), artifactId)
  return artifactId
}

function createWorkflowArtifactId(
  workflow: QgisWorkflowState,
  artifactPath: string,
  relativePath?: string
): string {
  const baseCandidate =
    sanitizeArtifactIdCandidate(relativePath || path.basename(artifactPath)) || 'artifact'

  if (baseCandidate === 'artifact') {
    return takeNextWorkflowArtifactOrdinal(workflow)
  }

  let candidate = baseCandidate
  let suffix = 2

  while (workflow.artifactIdToPath.has(candidate)) {
    candidate = `${baseCandidate}_${suffix}`
    suffix += 1
  }

  return candidate
}

function takeNextWorkflowArtifactOrdinal(workflow: QgisWorkflowState): string {
  let ordinal = workflow.nextArtifactOrdinal
  let candidate = `artifact_${ordinal}`

  while (workflow.artifactIdToPath.has(candidate)) {
    ordinal += 1
    candidate = `artifact_${ordinal}`
  }

  workflow.nextArtifactOrdinal = ordinal + 1
  return candidate
}

function sanitizeArtifactIdCandidate(value: string): string {
  const withoutExtension = value.replace(/\.[A-Za-z0-9]+$/u, '')
  return withoutExtension
    .trim()
    .replace(/[\\/]+/g, '_')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function collectOutputPathsFromNamedObject(value: unknown, candidates: Set<string>): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (OUTPUT_KEY_PATTERN.test(key)) {
      collectPathsFromStructuredValue(entry, candidates, key)
    }
  }
}

function collectResultArtifactPaths(value: unknown, candidates: Set<string>): void {
  if (!value) {
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPathsFromStructuredValue(entry, candidates, 'results')
    }
    return
  }

  if (!isRecord(value)) {
    return
  }

  for (const [key, entry] of Object.entries(value)) {
    if (OUTPUT_KEY_PATTERN.test(key) || /^(outputs?|results?)$/i.test(key)) {
      collectPathsFromStructuredValue(entry, candidates, key)
    }
  }
}

function collectPathsFromStructuredValue(
  value: unknown,
  candidates: Set<string>,
  parentKey = ''
): void {
  if (typeof value === 'string') {
    const normalizedPath = normalizeArtifactPath(value)
    if (normalizedPath) {
      candidates.add(normalizedPath)
    }
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPathsFromStructuredValue(entry, candidates, parentKey)
    }
    return
  }

  if (!value || typeof value !== 'object') {
    return
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const shouldInspect = OUTPUT_KEY_PATTERN.test(key) || /^(outputs?|results?)$/i.test(parentKey)
    if (shouldInspect) {
      collectPathsFromStructuredValue(entry, candidates, key)
    }
  }
}

function classifyArtifactKind(filePath: string): QgisArtifactRecord['kind'] {
  const extension = path.extname(filePath).toLowerCase()
  switch (extension) {
    case '.geojson':
    case '.json':
    case '.gpkg':
      return 'vector'
    case '.tif':
    case '.tiff':
      return 'raster'
    case '.qml':
    case '.sld':
      return 'style'
    case '.pdf':
    case '.png':
    case '.jpg':
    case '.jpeg':
      return 'layout'
    case '.csv':
      return 'table'
    default:
      return 'other'
  }
}

function normalizeProcessResult(
  operation: QgisProcessOperation,
  input: {
    algorithmId?: string
    stdout: string
    parsedResult: unknown
    artifacts: QgisArtifactRecord[]
  }
): unknown {
  if (operation === 'listAlgorithms') {
    return normalizeQgisAlgorithmList(input.parsedResult, input.stdout)
  }

  if (operation === 'describeAlgorithm') {
    return input.parsedResult ?? { stdout: input.stdout }
  }

  return omitUndefined({
    algorithmId: input.algorithmId,
    artifacts: input.artifacts,
    raw: input.parsedResult ?? input.stdout
  })
}

interface FilterableAlgorithmEntry {
  id: string
  name?: string
  provider?: string
  supportedForExecution: boolean
}

interface RankedFallbackAlgorithmEntry {
  algorithm: FilterableAlgorithmEntry
  matchedTerms: number
}

function filterAlgorithmList(
  value: unknown,
  options: Pick<QgisListAlgorithmsRequest, 'query' | 'provider' | 'limit'>
): {
  algorithms: FilterableAlgorithmEntry[]
  totalAlgorithms: number
  matchedAlgorithms: number
  returnedAlgorithms: number
  truncated: boolean
  filters?: {
    query?: string
    provider?: string
    limit?: number
  }
} {
  const algorithms = extractAlgorithmEntries(value)
  const normalizedQuery = normalizeOptionalText(options.query)
  const normalizedProvider = normalizeOptionalText(options.provider)?.toLowerCase()
  const limit =
    typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? Math.max(1, Math.min(Math.floor(options.limit), 200))
      : undefined

  const providerFilteredAlgorithms = algorithms.filter((algorithm) => {
    const algorithmProvider = (algorithm.provider || algorithm.id.split(':')[0] || '').toLowerCase()
    return !normalizedProvider || algorithmProvider === normalizedProvider
  })

  const matchedAlgorithms = normalizedQuery
    ? searchFallbackAlgorithmEntries(providerFilteredAlgorithms, normalizedQuery)
    : providerFilteredAlgorithms

  const returnedAlgorithms =
    typeof limit === 'number' ? matchedAlgorithms.slice(0, limit) : matchedAlgorithms
  const filters = omitUndefined({
    query: normalizedQuery,
    provider: normalizedProvider,
    limit
  })

  return {
    algorithms: returnedAlgorithms,
    totalAlgorithms: algorithms.length,
    matchedAlgorithms: matchedAlgorithms.length,
    returnedAlgorithms: returnedAlgorithms.length,
    truncated: returnedAlgorithms.length < matchedAlgorithms.length,
    ...(Object.keys(filters).length > 0 ? { filters } : {})
  }
}

function extractAlgorithmEntries(value: unknown): Array<{
  id: string
  name?: string
  provider?: string
  supportedForExecution: boolean
}> {
  if (!isRecord(value) || !Array.isArray(value.algorithms)) {
    return []
  }

  const algorithms: FilterableAlgorithmEntry[] = []

  for (const entry of value.algorithms) {
    if (!isRecord(entry)) {
      continue
    }

    const id = readString(entry.id)
    if (!id) {
      continue
    }

    algorithms.push({
      id,
      name: readString(entry.name),
      provider: readString(entry.provider, id.split(':')[0]),
      supportedForExecution: entry.supportedForExecution !== false
    })
  }

  return algorithms
}

function searchFallbackAlgorithmEntries(
  algorithms: FilterableAlgorithmEntry[],
  query: string
): FilterableAlgorithmEntry[] {
  const queryTerms = tokenizeQgisSearchText(query)
  if (queryTerms.length === 0) {
    return []
  }

  return algorithms
    .map((algorithm) => {
      const searchableText = buildFallbackSearchText(algorithm)
      let matchedTerms = 0

      for (const term of queryTerms) {
        if (searchableText.includes(term)) {
          matchedTerms += 1
        }
      }

      if (matchedTerms === 0) {
        return null
      }

      return {
        algorithm,
        matchedTerms
      }
    })
    .filter((result): result is RankedFallbackAlgorithmEntry => result !== null)
    .sort(compareFallbackAlgorithmEntries)
    .map(({ algorithm }) => algorithm)
}

function buildFallbackSearchText(algorithm: FilterableAlgorithmEntry): string {
  return normalizeQgisSearchText(
    [algorithm.id, algorithm.name, algorithm.provider]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
  )
}

function compareFallbackAlgorithmEntries(
  left: RankedFallbackAlgorithmEntry,
  right: RankedFallbackAlgorithmEntry
): number {
  if (left.matchedTerms !== right.matchedTerms) {
    return right.matchedTerms - left.matchedTerms
  }

  if (left.algorithm.supportedForExecution !== right.algorithm.supportedForExecution) {
    return left.algorithm.supportedForExecution ? -1 : 1
  }

  return buildFallbackSortName(left.algorithm).localeCompare(buildFallbackSortName(right.algorithm))
}

function buildFallbackSortName(algorithm: FilterableAlgorithmEntry): string {
  return normalizeQgisSearchText(algorithm.name || algorithm.id)
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function summarizeCommandFailure(stderr: string, stdout: string): string {
  const summary = firstNonEmptyLine(stderr) || firstNonEmptyLine(stdout)
  return summary || 'QGIS execution failed'
}

function firstNonEmptyLine(value: string): string | null {
  return (
    value
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0) ?? null
  )
}

function readString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return undefined
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalizedValue = readString(value)
  return normalizedValue && normalizedValue.length > 0 ? normalizedValue : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isWorkflowState(workspace: PreparedWorkspace): workspace is QgisWorkflowState {
  return typeof workspace.workflowId === 'string' && workspace.workflowId.trim().length > 0
}

function isQgisAlgorithmIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_]+:[A-Za-z0-9_]+$/.test(value.trim())
}

function limitText(value: string): string | undefined {
  if (value.trim().length === 0) {
    return undefined
  }

  return value.length > MAX_STDIO_PREVIEW_LENGTH
    ? `${value.slice(0, MAX_STDIO_PREVIEW_LENGTH)}...`
    : value
}

function sanitizeFileName(value: string): string {
  const sanitized = Array.from(value)
    .filter((character) => {
      const charCode = character.charCodeAt(0)
      return charCode >= 0x20 && !/[<>:"/\\|?*]/.test(character)
    })
    .join('')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return sanitized || 'qgis'
}

function normalizeLayoutFormat(
  format: QgisExportLayoutRequest['format'],
  outputPath?: string
): 'pdf' | 'image' | null {
  if (format === 'pdf' || format === 'image') {
    return format
  }

  const extension = outputPath ? path.extname(outputPath).toLowerCase() : ''
  if (extension === '.pdf') {
    return 'pdf'
  }

  if (['.png', '.jpg', '.jpeg'].includes(extension)) {
    return 'image'
  }

  return outputPath ? null : 'pdf'
}

function toPathLookupKey(filePath: string): string {
  const normalizedPath = filePath.replace(/[\\/]+/g, '/')
  return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath
}

function defaultBroadcastLayerImports(payload: LayerImportDefinitionsPayload): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannels.layersImportDefinitionsEvent, payload)
  }
}
