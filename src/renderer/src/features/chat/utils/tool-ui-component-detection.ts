import ChartDisplay from '../../visualization/components/chart-display'
import type { ChartDisplayProps } from '../../visualization/components/chart-display'

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