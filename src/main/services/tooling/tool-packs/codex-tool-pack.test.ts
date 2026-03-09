import { describe, expect, it, vi } from 'vitest'
import { runCustomAnalysisWithCodexToolName } from '../../../llm-tools/codex-tools'
import { registerCodexTools } from './codex-tool-pack'

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

describe('registerCodexTools', () => {
  it('returns a stable error shape when the runtime is unavailable', async () => {
    const { registry, entries } = createRegistry()
    registerCodexTools(registry, {
      getCodexRuntimeService: () => null
    })

    const tool = entries.get(runCustomAnalysisWithCodexToolName)
    const result = (await tool?.execute({
      args: { goal: 'Summarize this dataset.' },
      chatId: 'chat-123'
    })) as { status: string; message: string }

    expect(result.status).toBe('error')
    expect(result.message).toContain('not configured')
  })

  it('delegates to the Codex runtime and returns the normalized run payload', async () => {
    const { registry, entries } = createRegistry()
    const startRun = vi.fn(async () => ({
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

    registerCodexTools(registry, {
      getCodexRuntimeService: () =>
        ({
          startRun
        }) as never
    })

    const tool = entries.get(runCustomAnalysisWithCodexToolName)
    const result = (await tool?.execute({
      args: {
        goal: 'Join parcels to permits.',
        layerIds: ['layer-1'],
        expectedOutputs: ['GeoJSON output', 'Summary markdown']
      },
      chatId: 'chat-123'
    })) as {
      status: string
      run_id: string
      outputs_path: string
      artifacts: unknown[]
      staged_inputs: unknown[]
    }

    expect(startRun).toHaveBeenCalledWith({
      chatId: 'chat-123',
      goal: 'Join parcels to permits.',
      filePaths: undefined,
      layerIds: ['layer-1'],
      expectedOutputs: ['GeoJSON output', 'Summary markdown'],
      importPreference: undefined,
      model: undefined,
      reasoningEffort: undefined
    })
    expect(result).toEqual({
      status: 'completed',
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
})
