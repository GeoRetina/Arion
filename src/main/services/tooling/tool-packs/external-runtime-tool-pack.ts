import {
  runCustomAnalysisWithCodexToolDefinition,
  runCustomAnalysisWithCodexToolName,
  type RunCustomAnalysisWithCodexParams
} from '../../../llm-tools/codex-tools'
import {
  runExternalAnalysisToolDefinition,
  runExternalAnalysisToolName,
  type RunExternalAnalysisParams
} from '../../../llm-tools/external-runtime-tools/run-external-analysis-tool'
import type { ExternalRuntimeRunResult } from '../../../../shared/ipc-types'
import type { ExternalRuntimeRegistry } from '../../external-runtimes/external-runtime-registry'
import type { ToolRegistry } from '../tool-registry'

export interface ExternalRuntimeToolDependencies {
  getExternalRuntimeRegistry: () => ExternalRuntimeRegistry | null
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

function resolveRuntimeId(
  preferredRuntime: string | undefined,
  registry: ExternalRuntimeRegistry
): string {
  if (preferredRuntime) {
    return preferredRuntime
  }

  const runtimes = registry.listRuntimes()
  if (runtimes.length === 0) {
    throw new Error('No external runtimes are registered.')
  }

  return runtimes[0].id
}

async function runWithExternalRuntime(
  registry: ExternalRuntimeRegistry,
  chatId: string | undefined,
  params: RunExternalAnalysisParams
): Promise<ReturnType<typeof normalizeRunResult> | { status: string; message: string }> {
  if (!chatId) {
    return {
      status: 'error',
      message: 'External runtime runs require an active chat session.'
    }
  }

  const runtimeId = resolveRuntimeId(params.preferredRuntime, registry)
  const result = await registry.startRun({
    runtimeId,
    chatId,
    goal: params.goal,
    filePaths: params.filePaths,
    layerIds: params.layerIds,
    expectedOutputs: params.expectedOutputs,
    importPreference: params.importPreference,
    model: params.model,
    reasoningEffort: params.reasoningEffort
  })

  return normalizeRunResult(result)
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
        return await runWithExternalRuntime(externalRuntimeRegistry, chatId, params)
      } catch (error) {
        return {
          status: 'failed',
          message:
            error instanceof Error ? error.message : 'External runtime run failed unexpectedly.'
        }
      }
    }
  })

  registry.register({
    name: runCustomAnalysisWithCodexToolName,
    definition: runCustomAnalysisWithCodexToolDefinition,
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
        const params = args as RunCustomAnalysisWithCodexParams
        return await runWithExternalRuntime(externalRuntimeRegistry, chatId, {
          ...params,
          preferredRuntime: 'codex'
        })
      } catch (error) {
        return {
          status: 'failed',
          message: error instanceof Error ? error.message : 'Codex run failed unexpectedly.'
        }
      }
    }
  })
}
