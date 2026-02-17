import ChartDisplay from '../../visualization/components/chart-display'
import type { ChartDisplayProps } from '../../visualization/components/chart-display'
import AgentCallDisplay from '../components/agent-call-display'
import { useAgentStore } from '@/stores/agent-store'

export interface ToolUIComponent {
  component: React.ComponentType<UnsafeAny>
  props: UnsafeAny
  key: string
}

export interface ToolInvocation {
  toolCallId: string
  toolName: string
  args: UnsafeAny
  state: string
  result?: UnsafeAny
  error?: UnsafeAny
  isError?: boolean
}

/**
 * Detects if a tool result should render a special UI component
 * Returns the component and props if found, null otherwise
 */
export function detectToolUIComponent(toolInvocation: ToolInvocation): ToolUIComponent | null {
  const { toolName, state, result, toolCallId } = toolInvocation

  // Chart display detection
  if (toolName === 'display_chart' && state === 'result' && result) {
    const chartDisplayData: ChartDisplayProps['chartData'] = {
      chartId: result.chartId,
      chartType: result.chartType,
      data: result.data,
      config: result.config
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

  // Agent call detection
  if (toolName === 'call_agent') {
    const { message, agent_id, agent_name } = toolInvocation.args || {}

    // Extract agent name with priority: result > args > store lookup > formatted ID
    let agentName = result?.agent_name || agent_name
    if (!agentName) {
      agentName = useAgentStore.getState().getAgentName(agent_id) || `Agent ${agent_id}`
    }

    // Determine status based on tool state
    let status: 'loading' | 'completed' | 'error' = 'loading'
    if (state === 'result') {
      const isError = toolInvocation.isError || (result && result.status === 'error')
      status = isError ? 'error' : 'completed'
    } else if (state === 'error') {
      status = 'error'
    }

    return {
      component: AgentCallDisplay,
      props: {
        agentName,
        agentId: agent_id,
        message: message || 'No message provided',
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
export function detectNestedToolUIComponents(toolResult: UnsafeAny): ToolUIComponent[] {
  if (!toolResult?.toolResults || !Array.isArray(toolResult.toolResults)) {
    return []
  }

  const uiComponents: ToolUIComponent[] = []

  toolResult.toolResults.forEach((nestedTool: UnsafeAny, index: number) => {
    if (nestedTool.toolName && nestedTool.result) {
      const mockInvocation: ToolInvocation = {
        toolCallId: `nested-${index}`,
        toolName: nestedTool.toolName,
        args: nestedTool.args || {},
        state: 'result',
        result: nestedTool.result
      }

      const uiComponent = detectToolUIComponent(mockInvocation)
      if (uiComponent) {
        // Update key to be more specific for nested components
        uiComponent.key = `nested-${nestedTool.toolName}-${index}`
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
            ? nestedToolRecord.args
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
