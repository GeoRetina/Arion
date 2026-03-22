import { describe, expect, it, vi } from 'vitest'

vi.mock('./tooling/register-built-in-tools', async () => {
  const { z } = await import('zod')
  const { runExternalAnalysisToolName } =
    await import('../llm-tools/external-runtime-tools/run-external-analysis-tool')

  return {
    registerBuiltInTools: vi.fn(
      ({ registry }: { registry: { register: (tool: unknown) => void } }) => {
        registry.register({
          name: runExternalAnalysisToolName,
          definition: {
            description: 'Run analysis in an external runtime.',
            inputSchema: z.object({
              goal: z.string()
            })
          },
          category: 'integrations',
          execute: vi.fn(async () => ({ status: 'completed' }))
        })
        registry.register({
          name: 'query_knowledge_base',
          definition: {
            description: 'Query the knowledge base.',
            inputSchema: z.object({
              query: z.string()
            })
          },
          category: 'knowledge-base',
          execute: vi.fn(async () => ({ status: 'completed' }))
        })
      }
    )
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:/tmp'),
    getAppPath: vi.fn(() => 'C:/app')
  },
  BrowserWindow: class BrowserWindow {}
}))

import { LlmToolService } from './llm-tool-service'
import { runExternalAnalysisToolName } from '../llm-tools/external-runtime-tools/run-external-analysis-tool'

function createService(
  activeRuntimeId: string | null,
  registeredRuntimeIds: string[] = ['codex']
): LlmToolService {
  const settingsService = {
    getSetting: vi.fn(async () => activeRuntimeId)
  }

  const externalRuntimeRegistry = {
    listRuntimes: vi.fn(() =>
      registeredRuntimeIds.map((runtimeId) => ({
        id: runtimeId,
        name: runtimeId,
        description: `${runtimeId} runtime`,
        runtimeKind: 'coding-runtime' as const,
        providerHint: 'openai' as const,
        defaultConfig: {},
        configFields: []
      }))
    )
  }

  return new LlmToolService(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    settingsService as never,
    externalRuntimeRegistry as never
  )
}

describe('LlmToolService external runtime tool visibility', () => {
  it('hides the external runtime tool when no runtime is enabled', async () => {
    const service = createService(null)

    await expect(service.getAllAvailableTools()).resolves.not.toContain(runExternalAnalysisToolName)
    await expect(service.getToolDefinitionsForLLM([runExternalAnalysisToolName])).resolves.toEqual(
      {}
    )
  })

  it('hides the external runtime tool when the stored runtime is no longer registered', async () => {
    const service = createService('codex', ['claude-code'])

    await expect(service.getAllAvailableTools()).resolves.not.toContain(runExternalAnalysisToolName)
    await expect(service.getToolDefinitionsForLLM([runExternalAnalysisToolName])).resolves.toEqual(
      {}
    )
  })

  it('shows the external runtime tool when an enabled runtime is registered', async () => {
    const service = createService('codex')

    await expect(service.getAllAvailableTools()).resolves.toContain(runExternalAnalysisToolName)

    const toolDefinitions = await service.getToolDefinitionsForLLM([runExternalAnalysisToolName])
    expect(Object.keys(toolDefinitions)).toContain(runExternalAnalysisToolName)
  })
})
