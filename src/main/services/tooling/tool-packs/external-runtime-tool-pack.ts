import {
  runExternalAnalysisToolDefinition,
  runExternalAnalysisToolName,
  type RunExternalAnalysisParams
} from '../../../llm-tools/external-runtime-tools/run-external-analysis-tool'
import type { ExternalRuntimeRunResult } from '../../../../shared/ipc-types'
import type { ExternalRuntimeRegistry } from '../../external-runtimes/external-runtime-registry'
import { ExternalRuntimeSelectionService } from '../../external-runtimes/external-runtime-selection-service'
import type { ToolRegistry } from '../tool-registry'

export interface ExternalRuntimeToolDependencies {
  getExternalRuntimeRegistry: () => ExternalRuntimeRegistry | null
  getActiveExternalRuntimeId: () => Promise<string | null>
}

function normalizeRunResult(result: ExternalRuntimeRunResult): {
  status: string
  runtime_id: string
  runtime_name: string
  run_id: string
  summary: string | null | undefined
  error: string | null | undefined
  workspace_path: string
  outputs_path: string
  manifest_path: string
  started_at: string
  completed_at: string | null | undefined
  artifacts: typeof result.artifacts
  staged_inputs: typeof result.stagedInputs
} {
  return {
    status: result.status,
    runtime_id: result.runtimeId,
    runtime_name: result.runtimeName,
    run_id: result.runId,
    summary: result.summary,
    error: result.error,
    workspace_path: result.workspacePath,
    outputs_path: result.outputsPath,
    manifest_path: result.manifestPath,
    started_at: result.startedAt,
    completed_at: result.completedAt,
    artifacts: result.artifacts,
    staged_inputs: result.stagedInputs
  }
}

async function runWithExternalRuntime(
  registry: ExternalRuntimeRegistry,
  deps: ExternalRuntimeToolDependencies,
  chatId: string | undefined,
  params: RunExternalAnalysisParams
): Promise<
  | (ReturnType<typeof normalizeRunResult> & {
      selection_reason: string
    })
  | { status: string; message: string }
> {
  if (!chatId) {
    return {
      status: 'error',
      message: 'External runtime runs require an active chat session.'
    }
  }

  const selectionService = new ExternalRuntimeSelectionService(
    registry,
    deps.getActiveExternalRuntimeId
  )
  const selection = await selectionService.selectRuntime(params)
  const result = await registry.startRun({
    runtimeId: selection.runtimeId,
    chatId,
    goal: params.goal,
    filePaths: params.filePaths,
    layerIds: params.layerIds,
    expectedOutputs: params.expectedOutputs,
    importPreference: params.importPreference,
    model: params.model,
    reasoningEffort: params.reasoningEffort
  })

  return {
    ...normalizeRunResult(result),
    selection_reason: selection.reason
  }
}

export function registerExternalRuntimeTools(
  registry: ToolRegistry,
  deps: ExternalRuntimeToolDependencies
): void {
  registry.register({
    name: runExternalAnalysisToolName,
    definition: runExternalAnalysisToolDefinition,
    category: 'integrations',
    execute: async ({ args, chatId }) => {
      const externalRuntimeRegistry = deps.getExternalRuntimeRegistry()
      if (!externalRuntimeRegistry) {
        return {
          status: 'error',
          message: 'External runtime registry is not configured.'
        }
      }

      try {
        const params = args as RunExternalAnalysisParams
        return await runWithExternalRuntime(externalRuntimeRegistry, deps, chatId, params)
      } catch (error) {
        return {
          status: 'failed',
          message:
            error instanceof Error ? error.message : 'External runtime run failed unexpectedly.'
        }
      }
    }
  })
}
