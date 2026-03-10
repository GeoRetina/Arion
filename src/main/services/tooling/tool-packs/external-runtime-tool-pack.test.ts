import { describe, expect, it, vi } from 'vitest'
import { runCustomAnalysisWithCodexToolName } from '../../../llm-tools/codex-tools'
import { runExternalAnalysisToolName } from '../../../llm-tools/external-runtime-tools/run-external-analysis-tool'
import { registerExternalRuntimeTools } from './external-runtime-tool-pack'

function createRegistry(): {
  registry: never
  entries: Map<
    string,
    { execute: (params: { args: unknown; chatId?: string }) => Promise<unknown> }
  >
} {
  const entries = new Map<
    string,
    { execute: (params: { args: unknown; chatId?: string }) => Promise<unknown> }
  >()

  return {
    registry: {
      register: (tool: {
        name: string
        execute: (params: { args: unknown; chatId?: string }) => Promise<unknown>
      }) => {
        entries.set(tool.name, { execute: tool.execute })
      }
    } as never,
    entries
  }
}

describe('registerExternalRuntimeTools', () => {
  it('returns a stable error shape when the runtime registry is unavailable', async () => {
    const { registry, entries } = createRegistry()
    registerExternalRuntimeTools(registry, {
      getExternalRuntimeRegistry: () => null
    })

    const tool = entries.get(runExternalAnalysisToolName)
    const result = (await tool?.execute({
      args: { goal: 'Summarize this dataset.' },
      chatId: 'chat-123'
    })) as { status: string; message: string }

    expect(result.status).toBe('error')
    expect(result.message).toContain('not configured')
  })

  it('delegates generic analysis runs through the external runtime registry', async () => {
    const { registry, entries } = createRegistry()
    const startRun = vi.fn(async () => ({
      runtimeId: 'codex',
      runtimeName: 'Codex',
      runId: 'run-1',
      chatId: 'chat-123',
      status: 'completed',
      goal: 'Join parcels to permits.',
      model: 'gpt-5.3-codex',
      reasoningEffort: 'medium',
      workspacePath: 'C:/runs/chat-123/run-1',
      inputsPath: 'C:/runs/chat-123/run-1/inputs',
      outputsPath: 'C:/runs/chat-123/run-1/outputs',
      logsPath: 'C:/runs/chat-123/run-1/logs',
      manifestPath: 'C:/runs/chat-123/run-1/manifest.json',
      startedAt: '2026-03-09T12:00:00.000Z',
      updatedAt: '2026-03-09T12:01:00.000Z',
      completedAt: '2026-03-09T12:01:00.000Z',
      summary: 'Created a joined GeoJSON layer.',
      error: null,
      artifacts: [{ id: 'artifact-1', relativePath: 'summary.md' }],
      stagedInputs: [{ id: 'prompt', stagedPath: 'inputs/prompt.md' }]
    }))

    registerExternalRuntimeTools(registry, {
      getExternalRuntimeRegistry: () =>
        ({
          listRuntimes: () => [{ id: 'codex', name: 'Codex' }],
          startRun
        }) as never
    })

    const tool = entries.get(runExternalAnalysisToolName)
    const result = (await tool?.execute({
      args: {
        goal: 'Join parcels to permits.',
        preferredRuntime: 'codex',
        layerIds: ['layer-1'],
        expectedOutputs: ['GeoJSON output', 'Summary markdown'],
        reasoningEffort: 'xhigh'
      },
      chatId: 'chat-123'
    })) as {
      status: string
      runtime_id: string
      run_id: string
      outputs_path: string
      artifacts: unknown[]
      staged_inputs: unknown[]
    }

    expect(startRun).toHaveBeenCalledWith({
      runtimeId: 'codex',
      chatId: 'chat-123',
      goal: 'Join parcels to permits.',
      filePaths: undefined,
      layerIds: ['layer-1'],
      expectedOutputs: ['GeoJSON output', 'Summary markdown'],
      importPreference: undefined,
      model: undefined,
      reasoningEffort: 'xhigh'
    })
    expect(result).toEqual({
      status: 'completed',
      runtime_id: 'codex',
      runtime_name: 'Codex',
      run_id: 'run-1',
      summary: 'Created a joined GeoJSON layer.',
      error: null,
      workspace_path: 'C:/runs/chat-123/run-1',
      outputs_path: 'C:/runs/chat-123/run-1/outputs',
      manifest_path: 'C:/runs/chat-123/run-1/manifest.json',
      started_at: '2026-03-09T12:00:00.000Z',
      completed_at: '2026-03-09T12:01:00.000Z',
      artifacts: [{ id: 'artifact-1', relativePath: 'summary.md' }],
      staged_inputs: [{ id: 'prompt', stagedPath: 'inputs/prompt.md' }]
    })
  })

  it('keeps the Codex-specific alias routed through the generic runtime tool path', async () => {
    const { registry, entries } = createRegistry()
    const startRun = vi.fn(async () => ({
      runtimeId: 'codex',
      runtimeName: 'Codex',
      runId: 'run-2',
      chatId: 'chat-123',
      status: 'completed',
      goal: 'Inspect a CRS issue.',
      model: 'gpt-5.3-codex',
      reasoningEffort: 'medium',
      workspacePath: 'C:/runs/chat-123/run-2',
      inputsPath: 'C:/runs/chat-123/run-2/inputs',
      outputsPath: 'C:/runs/chat-123/run-2/outputs',
      logsPath: 'C:/runs/chat-123/run-2/logs',
      manifestPath: 'C:/runs/chat-123/run-2/manifest.json',
      startedAt: '2026-03-09T12:00:00.000Z',
      updatedAt: '2026-03-09T12:01:00.000Z',
      completedAt: '2026-03-09T12:01:00.000Z',
      summary: 'Inspected the CRS mismatch.',
      error: null,
      artifacts: [],
      stagedInputs: []
    }))

    registerExternalRuntimeTools(registry, {
      getExternalRuntimeRegistry: () =>
        ({
          listRuntimes: () => [{ id: 'codex', name: 'Codex' }],
          startRun
        }) as never
    })

    const tool = entries.get(runCustomAnalysisWithCodexToolName)
    await tool?.execute({
      args: { goal: 'Inspect a CRS issue.' },
      chatId: 'chat-123'
    })

    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeId: 'codex',
        goal: 'Inspect a CRS issue.'
      })
    )
  })
})
