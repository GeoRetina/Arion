import type { ElementType } from 'react'
import ChartDisplay from '../../visualization/components/chart-display'
import type { ChartDisplayProps } from '../../visualization/components/chart-display'
import AgentCallDisplay from '../components/agent-call-display'
import ExternalRuntimeRunCard from '../components/external-runtime-run-card'
import { useAgentStore } from '@/stores/agent-store'
import {
  CALL_AGENT_TOOL_NAME,
  RUN_EXTERNAL_ANALYSIS_TOOL_NAME
} from '../constants/message-constants'

export interface ToolUIComponent {
  component: ElementType
  props: Record<string, unknown>
  key: string
}

export interface ToolInvocation {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  state: string
  result?: unknown
  error?: unknown
  isError?: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/**
 * Detects if a tool result should render a special UI component
 * Returns the component and props if found, null otherwise
 */
export function detectToolUIComponent(toolInvocation: ToolInvocation): ToolUIComponent | null {
  const { toolName, state, result, toolCallId } = toolInvocation
  const resultRecord = asRecord(result)

  // Chart display detection
  if (toolName === 'display_chart' && state === 'result' && resultRecord) {
    const chartDisplayData: ChartDisplayProps['chartData'] = {
      chartId: String(resultRecord.chartId ?? ''),
      chartType: resultRecord.chartType as ChartDisplayProps['chartData']['chartType'],
      data: Array.isArray(resultRecord.data)
        ? (resultRecord.data as ChartDisplayProps['chartData']['data'])
        : [],
      config: asRecord(resultRecord.config) ?? {}
    }

    if (
      chartDisplayData.chartId &&
      chartDisplayData.chartType &&
      chartDisplayData.data &&
      chartDisplayData.config
    ) {
      return {
        component: ChartDisplay,
        props: { chartData: chartDisplayData },
        key: toolCallId
      }
    }
  }

  if (toolName === RUN_EXTERNAL_ANALYSIS_TOOL_NAME && state === 'result' && resultRecord) {
    return {
      component: ExternalRuntimeRunCard,
      props: {
        result
      },
      key: toolCallId
    }
  }

  // Agent call detection
  if (toolName === CALL_AGENT_TOOL_NAME) {
    const { message, agent_id, agent_handle, agent_name } = toolInvocation.args || {}
    const agentReference =
      (typeof agent_id === 'string' && agent_id) ||
      (typeof agent_handle === 'string' && agent_handle) ||
      ''

    // Extract agent name with priority: result > args > store lookup > formatted ID
    let agentName =
      (typeof resultRecord?.agent_name === 'string' ? resultRecord.agent_name : undefined) ||
      (typeof agent_name === 'string' ? agent_name : undefined)
    if (!agentName && agentReference) {
      agentName = useAgentStore.getState().getAgentName(agentReference) || agentReference
    }

    // Determine status based on tool state
    let status: 'loading' | 'completed' | 'error' = 'loading'
    if (state === 'result') {
      const isError = toolInvocation.isError || resultRecord?.status === 'error'
      status = isError ? 'error' : 'completed'
    } else if (state === 'error') {
      status = 'error'
    }

    return {
      component: AgentCallDisplay,
      props: {
        agentName,
        agentId: agentReference,
        message: typeof message === 'string' ? message : 'No message provided',
        status,
        result: state === 'result' ? result : undefined
      },
      key: toolCallId
    }
  }

  // Add other tool UI components here in the future
  // Example:
  // if (toolName === 'display_map' && state === 'result' && result) {
  //   return {
  //     component: MapDisplay,
  //     props: { mapData: result },
  //     key: toolCallId
  //   }
  // }

  return null
}

/**
 * Finds nested tool results that should render special UI components
 */
export function detectNestedToolUIComponents(toolResult: unknown): ToolUIComponent[] {
  const toolResultRecord = asRecord(toolResult)
  const toolResults = toolResultRecord?.toolResults
  if (!Array.isArray(toolResults)) {
    return []
  }

  const uiComponents: ToolUIComponent[] = []

  toolResults.forEach((nestedTool: unknown, index: number) => {
    const nestedToolRecord = asRecord(nestedTool)
    if (typeof nestedToolRecord?.toolName === 'string' && nestedToolRecord.result) {
      const mockInvocation: ToolInvocation = {
        toolCallId: `nested-${index}`,
        toolName: nestedToolRecord.toolName,
        args: asRecord(nestedToolRecord.args) ?? {},
        state: 'result',
        result: nestedToolRecord.result
      }

      const uiComponent = detectToolUIComponent(mockInvocation)
      if (uiComponent) {
        // Update key to be more specific for nested components
        uiComponent.key = `nested-${nestedToolRecord.toolName}-${index}`
        uiComponents.push(uiComponent)
      }
    }
  })

  return uiComponents
}

/**
 * Detects all nested tool calls from agent execution results
 * Returns an array of ToolInvocation objects for rendering regular tool call displays
 *
 * @param toolResult - The result object from a tool execution that may contain nested tool results
 * @returns Array of ToolInvocation objects representing nested tool calls
 */
export function detectNestedToolCalls(
  toolResult: unknown,
  parentToolCallId: string
): ToolInvocation[] {
  // Guard clause: ensure we have valid nested tool results
  if (!toolResult || typeof toolResult !== 'object') {
    return []
  }

  const toolResultRecord = toolResult as { toolResults?: unknown[] }
  const toolResults = toolResultRecord.toolResults
  if (!Array.isArray(toolResults) || toolResults.length === 0) {
    return []
  }

  const nestedToolCalls: ToolInvocation[] = []

  toolResults.forEach((nestedTool: unknown, index: number) => {
    const nestedToolRecord = nestedTool as {
      toolName?: unknown
      args?: unknown
      result?: unknown
      isError?: unknown
      error?: unknown
    }

    // Skip invalid nested tools
    if (
      !nestedTool ||
      typeof nestedTool !== 'object' ||
      typeof nestedToolRecord.toolName !== 'string'
    ) {
      return
    }

    try {
      const mockInvocation: ToolInvocation = {
        toolCallId: `${parentToolCallId}-nested-${nestedToolRecord.toolName}-${index}`, // Stable ID
        toolName: nestedToolRecord.toolName,
        args:
          nestedToolRecord.args && typeof nestedToolRecord.args === 'object'
            ? (nestedToolRecord.args as Record<string, unknown>)
            : {},
        state: 'result',
        result: nestedToolRecord.result,
        isError: Boolean(
          nestedToolRecord.isError ||
          nestedToolRecord.error ||
          (nestedToolRecord.result as { isError?: unknown } | undefined)?.isError
        )
      }

      nestedToolCalls.push(mockInvocation)
    } catch {
      void 0
    }
  })

  return nestedToolCalls
}
