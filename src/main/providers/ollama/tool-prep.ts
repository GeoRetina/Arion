import {
  UnsupportedFunctionalityError,
  type LanguageModelV3CallOptions,
  type SharedV3Warning
} from '@ai-sdk/provider'
import type { JSONSchema7 } from '@ai-sdk/provider'

type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'web_search_preview' }
  | { type: 'function'; name: string }

export function prepareResponsesTools({
  tools,
  toolChoice
}: {
  tools: LanguageModelV3CallOptions['tools']
  toolChoice?: LanguageModelV3CallOptions['toolChoice']
}): {
  tools?: Array<any>
  toolChoice?: ToolChoice
  toolWarnings: SharedV3Warning[]
} {
  const toolWarnings: SharedV3Warning[] = []
  const normalizedTools = tools?.length ? tools : undefined

  if (!normalizedTools) {
    return { tools: undefined, toolChoice: undefined, toolWarnings }
  }

  const mappedTools: Array<any> = []
  for (const tool of normalizedTools) {
    if (tool.type === 'function') {
      const parameters =
        tool.inputSchema ??
        ({
          type: 'object',
          properties: {},
          required: []
        } satisfies JSONSchema7)
      mappedTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters
        }
      })
    } else {
      toolWarnings.push({ type: 'unsupported', feature: `tool:${tool.type}` })
    }
  }

  if (!toolChoice) {
    return { tools: mappedTools, toolChoice: undefined, toolWarnings }
  }

  switch (toolChoice.type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: mappedTools, toolChoice: toolChoice.type, toolWarnings }
    case 'tool':
      return {
        tools: mappedTools,
        toolChoice:
          toolChoice.toolName === 'web_search_preview'
            ? { type: 'web_search_preview' }
            : { type: 'function', name: toolChoice.toolName },
        toolWarnings
      }
    default:
      throw new UnsupportedFunctionalityError({
        functionality: `tool choice type: ${(toolChoice as any)?.type ?? 'unknown'}`
      })
  }
}
