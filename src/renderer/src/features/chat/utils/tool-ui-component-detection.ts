import ChartDisplay from '../../visualization/components/chart-display'
import type { ChartDisplayProps } from '../../visualization/components/chart-display'
import AgentCallDisplay from '../components/agent-call-display'

export interface ToolUIComponent {
  component: React.ComponentType<any>
  props: any
  key: string
}

export interface ToolInvocation {
  toolCallId: string
  toolName: string
  args: any
  state: string
  result?: any
  error?: any
  isError?: boolean
}

/**
 * Detects if a tool result should render a special UI component
 * Returns the component and props if found, null otherwise
 */
export function detectToolUIComponent(
  toolInvocation: ToolInvocation
): ToolUIComponent | null {
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
    
    // Extract agent name from result if available, otherwise try from args, fallback to agent_id
    const agentName = result?.agent_name || agent_name || agent_id
    
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
export function detectNestedToolUIComponents(
  toolResult: any
): ToolUIComponent[] {
  if (!toolResult?.toolResults || !Array.isArray(toolResult.toolResults)) {
    return []
  }

  const uiComponents: ToolUIComponent[] = []

  toolResult.toolResults.forEach((nestedTool: any, index: number) => {
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
  toolResult: any
): ToolInvocation[] {
  // Guard clause: ensure we have valid nested tool results
  if (!toolResult || typeof toolResult !== 'object') {
    return []
  }
  
  const toolResults = toolResult.toolResults
  if (!Array.isArray(toolResults) || toolResults.length === 0) {
    return []
  }

  const nestedToolCalls: ToolInvocation[] = []

  toolResults.forEach((nestedTool: any, index: number) => {
    // Skip invalid nested tools
    if (!nestedTool || typeof nestedTool !== 'object' || typeof nestedTool.toolName !== 'string') {
      console.warn(`[detectNestedToolCalls] Skipping invalid nested tool at index ${index}:`, nestedTool)
      return
    }

    try {
      const mockInvocation: ToolInvocation = {
        toolCallId: `nested-tool-${Date.now()}-${index}`, // More unique ID
        toolName: nestedTool.toolName,
        args: nestedTool.args && typeof nestedTool.args === 'object' ? nestedTool.args : {},
        state: 'result',
        result: nestedTool.result,
        isError: Boolean(nestedTool.isError || nestedTool.error || (nestedTool.result?.isError))
      }

      nestedToolCalls.push(mockInvocation)
    } catch (error) {
      console.error(`[detectNestedToolCalls] Error processing nested tool at index ${index}:`, error, nestedTool)
    }
  })

  return nestedToolCalls
}