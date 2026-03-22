import { describe, expect, it, vi } from 'vitest'
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
      getExternalRuntimeRegistry: () => null,
      getActiveExternalRuntimeId: async () => null
    })

    const tool = entries.get(runExternalAnalysisToolName)
    const result = (await tool?.execute({
      args: { goal: 'Summarize this dataset.' },
      chatId: 'chat-123'
    })) as { status: string; message: string }

    expect(result.status).toBe('error')
    expect(result.message).toContain('not configured')
  })

  it('delegates generic analysis runs through the selected external runtime', async () => {
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
      workspacePath: 'C:/runs/codex/chat-123/run-1',
      inputsPath: 'C:/runs/codex/chat-123/run-1/inputs',
      outputsPath: 'C:/runs/codex/chat-123/run-1/outputs',
      logsPath: 'C:/runs/codex/chat-123/run-1/logs',
      manifestPath: 'C:/runs/codex/chat-123/run-1/manifest.json',
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
          listRuntimes: () => [
            {
              id: 'codex',
              name: 'Codex',
              description: 'Local Codex CLI runtime',
              runtimeKind: 'coding-runtime',
              providerHint: 'openai',
              defaultConfig: {},
              configFields: []
            }
          ],
          getDescriptor: (runtimeId: string) => ({ id: runtimeId, name: 'Codex' }),
          getHealth: vi.fn(async () => ({
            runtimeId: 'codex',
            runtimeName: 'Codex',
            checkedAt: '2026-03-09T12:00:00.000Z',
            install: {
              state: 'installed',
              version: '0.37.0',
              minimumSupportedVersion: '0.37.0',
              message: 'Codex CLI is installed.'
            },
            authState: 'authenticated',
            authMessage: 'Codex CLI is authenticated.',
            isReady: true
          })),
          startRun
        }) as never,
      getActiveExternalRuntimeId: async () => 'codex'
    })

    const tool = entries.get(runExternalAnalysisToolName)
    const result = (await tool?.execute({
      args: {
        goal: 'Join parcels to permits and create a GeoJSON output.',
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
      selection_reason: string
    }

    expect(startRun).toHaveBeenCalledWith({
      runtimeId: 'codex',
      chatId: 'chat-123',
      goal: 'Join parcels to permits and create a GeoJSON output.',
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
      workspace_path: 'C:/runs/codex/chat-123/run-1',
      outputs_path: 'C:/runs/codex/chat-123/run-1/outputs',
      manifest_path: 'C:/runs/codex/chat-123/run-1/manifest.json',
      started_at: '2026-03-09T12:00:00.000Z',
      completed_at: '2026-03-09T12:01:00.000Z',
      artifacts: [{ id: 'artifact-1', relativePath: 'summary.md' }],
      staged_inputs: [{ id: 'prompt', stagedPath: 'inputs/prompt.md' }],
      selection_reason: 'Selected Codex because it was explicitly requested and is enabled.'
    })
  })

  it('uses the runtime currently enabled in integrations', async () => {
    const { registry, entries } = createRegistry()
    const startRun = vi.fn(async (request: { runtimeId: string }) => ({
      runtimeId: request.runtimeId,
      runtimeName: request.runtimeId === 'claude-code' ? 'Claude Code' : 'Codex',
      runId: 'run-2',
      chatId: 'chat-123',
      status: 'completed',
      goal: 'Inspect the repository and fix the failing tests.',
      model: 'model',
      reasoningEffort: 'medium',
      workspacePath: 'C:/runs/runtime/run-2',
      inputsPath: 'C:/runs/runtime/run-2/inputs',
      outputsPath: 'C:/runs/runtime/run-2/outputs',
      logsPath: 'C:/runs/runtime/run-2/logs',
      manifestPath: 'C:/runs/runtime/run-2/manifest.json',
      startedAt: '2026-03-09T12:00:00.000Z',
      updatedAt: '2026-03-09T12:01:00.000Z',
      completedAt: '2026-03-09T12:01:00.000Z',
      summary: 'Done.',
      error: null,
      artifacts: [],
      stagedInputs: []
    }))

    registerExternalRuntimeTools(registry, {
      getExternalRuntimeRegistry: () =>
        ({
          listRuntimes: () => [
            {
              id: 'claude-code',
              name: 'Claude Code',
              description: 'CLI coding runtime',
              runtimeKind: 'coding-runtime',
              providerHint: 'anthropic',
              defaultConfig: {},
              configFields: []
            },
            {
              id: 'codex',
              name: 'Codex',
              description: 'CLI coding runtime',
              runtimeKind: 'coding-runtime',
              providerHint: 'openai',
              defaultConfig: {},
              configFields: []
            }
          ],
          getDescriptor: (runtimeId: string) => ({
            id: runtimeId,
            name: runtimeId === 'claude-code' ? 'Claude Code' : 'Codex'
          }),
          getHealth: vi.fn(async (runtimeId: string) => ({
            runtimeId,
            runtimeName: runtimeId,
            checkedAt: '2026-03-09T12:00:00.000Z',
            install: {
              state: 'installed',
              version: '1.0.0',
              minimumSupportedVersion: '1.0.0',
              message: 'Installed.'
            },
            authState: 'authenticated',
            authMessage: 'Authenticated.',
            isReady: true
          })),
          startRun
        }) as never,
      getActiveExternalRuntimeId: async () => 'claude-code'
    })

    const tool = entries.get(runExternalAnalysisToolName)
    await tool?.execute({
      args: {
        goal: 'Inspect the repository and fix the failing tests.',
        filePaths: ['E:/repo/package.json']
      },
      chatId: 'chat-123'
    })

    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeId: 'claude-code'
      })
    )
  })

  it('does not auto-enable the only registered runtime', async () => {
    const { registry, entries } = createRegistry()
    const startRun = vi.fn()

    registerExternalRuntimeTools(registry, {
      getExternalRuntimeRegistry: () =>
        ({
          listRuntimes: () => [
            {
              id: 'codex',
              name: 'Codex',
              description: 'CLI coding runtime',
              runtimeKind: 'coding-runtime',
              providerHint: 'openai',
              defaultConfig: {},
              configFields: []
            }
          ],
          getDescriptor: (runtimeId: string) => ({
            id: runtimeId,
            name: 'Codex'
          }),
          getHealth: vi.fn(),
          startRun
        }) as never,
      getActiveExternalRuntimeId: async () => null
    })

    const tool = entries.get(runExternalAnalysisToolName)
    const result = (await tool?.execute({
      args: {
        goal: 'Use the available coding runtime for this task.'
      },
      chatId: 'chat-123'
    })) as { status: string; message: string }

    expect(result.status).toBe('failed')
    expect(result.message).toContain('No external runtime is enabled')
    expect(startRun).not.toHaveBeenCalled()
  })

  it('rejects explicitly requested runtimes that are not enabled', async () => {
    const { registry, entries } = createRegistry()

    registerExternalRuntimeTools(registry, {
      getExternalRuntimeRegistry: () =>
        ({
          listRuntimes: () => [
            {
              id: 'claude-code',
              name: 'Claude Code',
              description: 'CLI coding runtime',
              runtimeKind: 'coding-runtime',
              providerHint: 'anthropic',
              defaultConfig: {},
              configFields: []
            },
            {
              id: 'codex',
              name: 'Codex',
              description: 'CLI coding runtime',
              runtimeKind: 'coding-runtime',
              providerHint: 'openai',
              defaultConfig: {},
              configFields: []
            }
          ],
          getDescriptor: (runtimeId: string) => ({
            id: runtimeId,
            name: runtimeId === 'claude-code' ? 'Claude Code' : 'Codex'
          }),
          getHealth: vi.fn(),
          startRun: vi.fn()
        }) as never,
      getActiveExternalRuntimeId: async () => null
    })

    const tool = entries.get(runExternalAnalysisToolName)
    const result = (await tool?.execute({
      args: {
        goal: 'Use Codex for this task.',
        preferredRuntime: 'codex'
      },
      chatId: 'chat-123'
    })) as { status: string; message: string }

    expect(result.status).toBe('failed')
    expect(result.message).toContain('not currently enabled')
  })
})
