import fs from 'fs/promises'
import path from 'path'
import { app } from 'electron'
import type { LayerDefinition } from '../../../shared/types/layer-types'
import type { ExternalRuntimeStagedInput } from '../../../shared/ipc-types'
import {
  isExternalLayerReference,
  resolveLocalLayerFilePath,
  trimToNonEmptyString
} from '../../../shared/lib/layer-source-paths'
import { ensureLocalFilesystemPath } from '../../security/path-security'

interface PreparedWorkspacePaths {
  workspacePath: string
  inputsPath: string
  outputsPath: string
  logsPath: string
  manifestPath: string
}

export interface ExternalRuntimePreparedRunWorkspace extends PreparedWorkspacePaths {
  prompt: string
  stagedInputs: ExternalRuntimeStagedInput[]
}

export interface ExternalRuntimeWorkspacePrepareRequest {
  runtimeId: string
  runtimeName: string
  chatId: string
  goal: string
  filePaths?: string[]
  layerIds?: string[]
  expectedOutputs?: string[]
  importPreference?: 'none' | 'suggest'
}

interface LayerCatalogEntry {
  id: string
  name: string
  type: string
  sourceType?: string
  stagedPath?: string | null
  status: 'staged' | 'skipped'
  note?: string
  metadata?: unknown
}

function sanitizeSegment(value: string, fallback: string): string {
  const sanitized = Array.from(value.trim())
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint < 32 || '<>:"/\\|?*'.includes(character) ? '-' : character
    })
    .join('')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/[. ]+$/g, '')
    .replace(/^-|-$/g, '')

  if (!sanitized || sanitized === '.' || sanitized === '..') {
    return fallback
  }

  return sanitized
}

function asLayerDefinition(value: unknown): LayerDefinition | null {
  return value && typeof value === 'object' ? (value as LayerDefinition) : null
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await fs.access(candidatePath)
    return true
  } catch {
    return false
  }
}

async function copyFileSafe(sourcePath: string, destinationPath: string): Promise<void> {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true })
  await fs.copyFile(sourcePath, destinationPath)
}

async function writeJsonFile(targetPath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.writeFile(targetPath, JSON.stringify(value, null, 2), 'utf8')
}

function withUniqueName(
  usedNames: Set<string>,
  directoryPath: string,
  preferredBaseName: string
): string {
  const parsed = path.parse(preferredBaseName)
  const baseName = sanitizeSegment(parsed.name || 'item', 'item')
  const ext = parsed.ext || ''

  let candidate = `${baseName}${ext}`
  let counter = 2
  while (usedNames.has(candidate)) {
    candidate = `${baseName}-${counter}${ext}`
    counter += 1
  }

  usedNames.add(candidate)
  return path.join(directoryPath, candidate)
}

export class ExternalRuntimeWorkspaceService {
  constructor(
    private readonly getRuntimeLayerSnapshot: () => unknown[] = () => [],
    private readonly getUserDataPath: () => string = () => app.getPath('userData')
  ) {}

  async prepareRun(
    runId: string,
    request: ExternalRuntimeWorkspacePrepareRequest
  ): Promise<ExternalRuntimePreparedRunWorkspace> {
    const workspace = await this.createWorkspacePaths(runId, request.chatId, request.runtimeId)
    const stagedInputs: ExternalRuntimeStagedInput[] = []
    const usedFileNames = new Set<string>()

    await fs.mkdir(workspace.inputsPath, { recursive: true })
    await fs.mkdir(workspace.outputsPath, { recursive: true })
    await fs.mkdir(workspace.logsPath, { recursive: true })

    const prompt = this.buildPrompt(request, workspace)

    const promptPath = path.join(workspace.inputsPath, 'prompt.md')
    await fs.writeFile(promptPath, prompt, 'utf8')
    stagedInputs.push({
      id: 'prompt',
      label: 'Run prompt',
      kind: 'prompt',
      sourcePath: null,
      stagedPath: promptPath,
      status: 'staged'
    })

    const requestPath = path.join(workspace.inputsPath, 'request.json')
    await writeJsonFile(requestPath, request)
    stagedInputs.push({
      id: 'request',
      label: 'Run request metadata',
      kind: 'metadata',
      sourcePath: null,
      stagedPath: requestPath,
      status: 'staged'
    })

    await this.stageFiles(
      request.filePaths || [],
      workspace,
      stagedInputs,
      usedFileNames,
      request.runtimeName
    )
    await this.stageLayers(request.layerIds || [], workspace, stagedInputs, usedFileNames)

    return {
      ...workspace,
      prompt,
      stagedInputs
    }
  }

  private async createWorkspacePaths(
    runId: string,
    chatId: string,
    runtimeId = 'runtime'
  ): Promise<PreparedWorkspacePaths> {
    const safeChatId = sanitizeSegment(chatId, 'chat')
    const safeRunId = sanitizeSegment(runId, 'run')
    const safeRuntimeId = sanitizeSegment(runtimeId, 'runtime')
    const workspacePath = path.join(
      this.getUserDataPath(),
      'external-runtime-runs',
      safeRuntimeId,
      safeChatId,
      safeRunId
    )

    await fs.mkdir(workspacePath, { recursive: true })

    return {
      workspacePath,
      inputsPath: path.join(workspacePath, 'inputs'),
      outputsPath: path.join(workspacePath, 'outputs'),
      logsPath: path.join(workspacePath, 'logs'),
      manifestPath: path.join(workspacePath, 'manifest.json')
    }
  }

  private async stageFiles(
    filePaths: string[],
    workspace: PreparedWorkspacePaths,
    stagedInputs: ExternalRuntimeStagedInput[],
    usedFileNames: Set<string>,
    runtimeName: string
  ): Promise<void> {
    const targetDirectory = path.join(workspace.inputsPath, 'files')

    for (const [index, rawFilePath] of filePaths.entries()) {
      const label = path.basename(rawFilePath || '') || `Input file ${index + 1}`
      try {
        const safeSourcePath = ensureLocalFilesystemPath(rawFilePath, `${runtimeName} input file`)

        const fileExists = await pathExists(safeSourcePath)
        if (!fileExists) {
          stagedInputs.push({
            id: `file-${index + 1}`,
            label,
            kind: 'file',
            sourcePath: safeSourcePath,
            stagedPath: path.join(targetDirectory, sanitizeSegment(label, 'file')),
            status: 'skipped',
            note: 'Source file does not exist.'
          })
          continue
        }

        const destinationPath = withUniqueName(usedFileNames, targetDirectory, path.basename(label))
        await copyFileSafe(safeSourcePath, destinationPath)
        stagedInputs.push({
          id: `file-${index + 1}`,
          label,
          kind: 'file',
          sourcePath: safeSourcePath,
          stagedPath: destinationPath,
          status: 'staged'
        })
      } catch (error) {
        stagedInputs.push({
          id: `file-${index + 1}`,
          label,
          kind: 'file',
          sourcePath: rawFilePath || null,
          stagedPath: path.join(targetDirectory, sanitizeSegment(label, 'file')),
          status: 'skipped',
          note: error instanceof Error ? error.message : 'Unable to stage the source file.'
        })
      }
    }
  }

  private async stageLayers(
    layerIds: string[],
    workspace: PreparedWorkspacePaths,
    stagedInputs: ExternalRuntimeStagedInput[],
    usedFileNames: Set<string>
  ): Promise<void> {
    if (layerIds.length === 0) {
      return
    }

    const runtimeLayers = this.getRuntimeLayerSnapshot()
      .map((entry) => asLayerDefinition(entry))
      .filter((entry): entry is LayerDefinition => Boolean(entry))
    const selectedLayers = layerIds
      .map((layerId) => runtimeLayers.find((layer) => layer.id === layerId))
      .filter((layer): layer is LayerDefinition => Boolean(layer))

    const catalogEntries: LayerCatalogEntry[] = []
    const layersDirectory = path.join(workspace.inputsPath, 'layers')

    for (const layer of selectedLayers) {
      const staged = await this.stageSingleLayer(layer, layersDirectory, usedFileNames)
      stagedInputs.push(staged.input)
      catalogEntries.push(staged.catalogEntry)
    }

    for (const missingLayerId of layerIds.filter(
      (layerId) => !selectedLayers.some((layer) => layer.id === layerId)
    )) {
      const missingPath = path.join(
        layersDirectory,
        `${sanitizeSegment(missingLayerId, 'layer')}.json`
      )
      stagedInputs.push({
        id: `layer-${missingLayerId}`,
        label: `Layer ${missingLayerId}`,
        kind: 'layer',
        sourcePath: null,
        stagedPath: missingPath,
        status: 'skipped',
        note: 'Layer was not available in the current runtime snapshot.'
      })
      catalogEntries.push({
        id: missingLayerId,
        name: missingLayerId,
        type: 'unknown',
        status: 'skipped',
        note: 'Layer was not available in the current runtime snapshot.'
      })
    }

    const catalogPath = path.join(workspace.inputsPath, 'layer-catalog.json')
    await writeJsonFile(catalogPath, catalogEntries)
    stagedInputs.push({
      id: 'layer-catalog',
      label: 'Layer catalog metadata',
      kind: 'metadata',
      sourcePath: null,
      stagedPath: catalogPath,
      status: 'staged'
    })
  }

  private async stageSingleLayer(
    layer: LayerDefinition,
    targetDirectory: string,
    usedFileNames: Set<string>
  ): Promise<{
    input: ExternalRuntimeStagedInput
    catalogEntry: LayerCatalogEntry
  }> {
    const baseLabel = layer.name || layer.id
    const localSourceData = trimToNonEmptyString(layer.sourceConfig.data)
    const localFilePath = resolveLocalLayerFilePath(layer)

    if (
      layer.sourceConfig.type === 'geojson' &&
      layer.sourceConfig.data &&
      typeof layer.sourceConfig.data === 'object'
    ) {
      const destinationPath = withUniqueName(
        usedFileNames,
        targetDirectory,
        `${sanitizeSegment(baseLabel, 'layer')}.geojson`
      )
      await writeJsonFile(destinationPath, layer.sourceConfig.data)
      return {
        input: {
          id: `layer-${layer.id}`,
          label: baseLabel,
          kind: 'layer',
          sourcePath: null,
          stagedPath: destinationPath,
          status: 'staged'
        },
        catalogEntry: {
          id: layer.id,
          name: layer.name,
          type: layer.type,
          sourceType: layer.sourceConfig.type,
          stagedPath: destinationPath,
          status: 'staged',
          metadata: layer.metadata
        }
      }
    }

    const preferredPath = localFilePath || localSourceData
    if (preferredPath && !isExternalLayerReference(preferredPath)) {
      try {
        const safeSourcePath = ensureLocalFilesystemPath(
          preferredPath,
          `Layer "${baseLabel}" source`
        )
        if (await pathExists(safeSourcePath)) {
          const destinationPath = withUniqueName(
            usedFileNames,
            targetDirectory,
            path.basename(safeSourcePath)
          )
          await copyFileSafe(safeSourcePath, destinationPath)
          return {
            input: {
              id: `layer-${layer.id}`,
              label: baseLabel,
              kind: 'layer',
              sourcePath: safeSourcePath,
              stagedPath: destinationPath,
              status: 'staged'
            },
            catalogEntry: {
              id: layer.id,
              name: layer.name,
              type: layer.type,
              sourceType: layer.sourceConfig.type,
              stagedPath: destinationPath,
              status: 'staged',
              metadata: layer.metadata
            }
          }
        }
      } catch (error) {
        return {
          input: {
            id: `layer-${layer.id}`,
            label: baseLabel,
            kind: 'layer',
            sourcePath: preferredPath,
            stagedPath: path.join(targetDirectory, sanitizeSegment(baseLabel, 'layer')),
            status: 'skipped',
            note: error instanceof Error ? error.message : 'Layer source could not be staged.'
          },
          catalogEntry: {
            id: layer.id,
            name: layer.name,
            type: layer.type,
            sourceType: layer.sourceConfig.type,
            status: 'skipped',
            note: error instanceof Error ? error.message : 'Layer source could not be staged.',
            metadata: layer.metadata
          }
        }
      }
    }

    const note = isExternalLayerReference(localSourceData || '')
      ? 'Layer source is an external or in-memory reference and was not copied into the run workspace.'
      : 'Layer source could not be copied into the run workspace.'

    return {
      input: {
        id: `layer-${layer.id}`,
        label: baseLabel,
        kind: 'layer',
        sourcePath: preferredPath,
        stagedPath: path.join(targetDirectory, sanitizeSegment(baseLabel, 'layer')),
        status: 'skipped',
        note
      },
      catalogEntry: {
        id: layer.id,
        name: layer.name,
        type: layer.type,
        sourceType: layer.sourceConfig.type,
        status: 'skipped',
        note,
        metadata: layer.metadata
      }
    }
  }

  private buildPrompt(
    request: ExternalRuntimeWorkspacePrepareRequest,
    workspace: PreparedWorkspacePaths
  ): string {
    const expectedOutputs =
      request.expectedOutputs && request.expectedOutputs.length > 0
        ? request.expectedOutputs.map((entry) => `- ${entry}`).join('\n')
        : '- Create the minimal set of artifacts needed to complete the request.'

    return [
      `You are running an external analysis job for Arion using ${request.runtimeName}.`,
      '',
      `Goal: ${request.goal}`,
      '',
      'Execution rules:',
      '- The current working directory is a dedicated per-run workspace.',
      '- Read staged inputs from `inputs/`.',
      '- Do not modify files under `inputs/`.',
      '- Write every generated artifact only under `outputs/`.',
      '- Always create `outputs/summary.md` with a concise human-readable summary of what you produced.',
      '- Prefer interoperable output formats: Markdown, GeoJSON, CSV, PNG, Python, and SQL.',
      '- If you create scripts, keep them runnable from this workspace and document how to use them in the summary.',
      '',
      'Requested outputs:',
      expectedOutputs,
      '',
      `Import preference: ${request.importPreference || 'suggest'}`,
      '',
      'Workspace layout:',
      `- Inputs: ${workspace.inputsPath}`,
      `- Outputs: ${workspace.outputsPath}`,
      `- Logs: ${workspace.logsPath}`,
      '',
      'When the work is complete, provide a concise final answer summarizing the analysis, the artifacts you created, and any limitations or follow-up steps.'
    ].join('\n')
  }
}
