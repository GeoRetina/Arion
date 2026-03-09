import {
  runCustomAnalysisWithCodexToolDefinition,
  runCustomAnalysisWithCodexToolName,
  type RunCustomAnalysisWithCodexParams
} from '../../../llm-tools/codex-tools'
import type { CodexRuntimeService } from '../../codex/codex-runtime-service'
import type { ToolRegistry } from '../tool-registry'

export interface CodexToolDependencies {
  getCodexRuntimeService: () => CodexRuntimeService | null
}

export function registerCodexTools(registry: ToolRegistry, deps: CodexToolDependencies): void {
  registry.register({
    name: runCustomAnalysisWithCodexToolName,
    definition: runCustomAnalysisWithCodexToolDefinition,
    category: 'integrations',
    execute: async ({ args, chatId }) => {
      const codexRuntimeService = deps.getCodexRuntimeService()
      if (!codexRuntimeService) {
        return {
          status: 'error',
          message: 'Codex runtime service is not configured.'
        }
      }

      if (!chatId) {
        return {
          status: 'error',
          message: 'Codex runs require an active chat session.'
        }
      }

      try {
        const params = args as RunCustomAnalysisWithCodexParams
        const result = await codexRuntimeService.startRun({
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
          status: result.status,
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
      } catch (error) {
        return {
          status: 'failed',
          message: error instanceof Error ? error.message : 'Codex run failed unexpectedly.'
        }
      }
    }
  })
}
