import qgisLogo from '@/assets/connector-logos/qgis.svg'

export interface ToolCallBranding {
  iconSrc: string
  iconClassName?: string
}

const QGIS_TOOL_PREFIX = 'qgis_'

export function getToolCallBranding(toolName: string): ToolCallBranding | null {
  if (toolName.startsWith(QGIS_TOOL_PREFIX)) {
    return {
      iconSrc: qgisLogo
    }
  }

  return null
}
