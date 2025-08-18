/**
 * Tool constants and definitions for dynamic system prompt generation.
 * This file provides a centralized way to define tool categories and descriptions
 * without hardcoding them in the system prompt.
 */

export interface ToolDescription {
  name: string
  description: string
  isMCP?: boolean // Tag to identify MCP tools
  mcpServer?: string // Name of the MCP server providing this tool
}

export interface ToolCategory {
  name: string
  tools: ToolDescription[]
}

/**
 * Core built-in tool categories with their descriptions.
 * These are always available and should match the actual available tools in the system.
 */
export const BUILTIN_TOOL_CATEGORIES: ToolCategory[] = [
  {
    name: 'Map Interaction',
    tools: [
      {
        name: 'set_map_view',
        description: 'Control map views like pan, zoom, and rotation'
      },
      {
        name: 'list_map_layers',
        description: 'List all currently available map layers'
      },
      {
        name: 'add_map_feature',
        description:
          'Add vector features (points, lines, polygons) to the map with specified coordinates and properties'
      },
      {
        name: 'add_georeferenced_image_layer',
        description: 'Add georeferenced images to the map'
      },
      {
        name: 'remove_map_layer',
        description: 'Remove existing layers from the map'
      },
      {
        name: 'set_layer_style',
        description: 'Style map layers with colors, symbols, and other visual properties'
      },
      {
        name: 'open_map_sidebar',
        description: 'Show or hide the map sidebar panel'
      }
    ]
  },
  {
    name: 'Data Analysis & Retrieval',
    tools: [
      {
        name: 'query_knowledge_base',
        description:
          'Perform Retrieval Augmented Generation (RAG) to answer questions based on provided documents or a knowledge base'
      }
    ]
  },
  {
    name: 'Geospatial Operations',
    tools: [
      {
        name: 'create_map_buffer',
        description: 'Perform common GIS operations like creating buffers around a point'
      }
    ]
  },
  {
    name: 'Visualization',
    tools: [
      {
        name: 'display_chart',
        description:
          'Request the generation and inline display of various chart types (e.g., bar, line, pie, area, scatter, radar, radial bar, donut, treemap) to summarize data'
      }
    ]
  },
  {
    name: 'Agent Management',
    tools: [
      {
        name: 'call_agent',
        description: 'Call specialized agents for domain-specific tasks'
      }
    ]
  }
]

/**
 * Generate tool descriptions for system prompt, including both built-in and MCP tools
 * @param mcpTools Optional array of MCP tools to include
 * @returns Formatted tool descriptions for system prompt
 */
export function generateToolDescriptions(mcpTools: ToolDescription[] = []): string {
  let toolDescriptions = ''

  // Add built-in tool categories
  for (const category of BUILTIN_TOOL_CATEGORIES) {
    toolDescriptions += `    <tool_category name="${category.name}">\n`

    for (const tool of category.tools) {
      toolDescriptions += `      <tool_description>${tool.description} (tool: ${tool.name}).</tool_description>\n`
    }

    toolDescriptions += `    </tool_category>\n\n`
  }

  // Add MCP tools if any are available
  if (mcpTools.length > 0) {
    // Group MCP tools by server
    const mcpByServer: { [server: string]: ToolDescription[] } = {}
    const ungroupedMcp: ToolDescription[] = []

    for (const tool of mcpTools) {
      if (tool.mcpServer) {
        if (!mcpByServer[tool.mcpServer]) {
          mcpByServer[tool.mcpServer] = []
        }
        mcpByServer[tool.mcpServer].push(tool)
      } else {
        ungroupedMcp.push(tool)
      }
    }

    // Add MCP tools grouped by server
    for (const [serverName, serverTools] of Object.entries(mcpByServer)) {
      toolDescriptions += `    <tool_category name="MCP Tools - ${serverName}">\n`

      for (const tool of serverTools) {
        toolDescriptions += `      <tool_description>${tool.description} (MCP tool: ${tool.name}).</tool_description>\n`
      }

      toolDescriptions += `    </tool_category>\n\n`
    }

    // Add ungrouped MCP tools
    if (ungroupedMcp.length > 0) {
      toolDescriptions += `    <tool_category name="MCP Tools - Additional">\n`

      for (const tool of ungroupedMcp) {
        toolDescriptions += `      <tool_description>${tool.description} (MCP tool: ${tool.name}).</tool_description>\n`
      }

      toolDescriptions += `    </tool_category>\n\n`
    }
  } else {
    // Add note about potential MCP tools when none are available
    toolDescriptions += `    <tool_category name="Dynamic MCP Tools">\n`
    toolDescriptions += `      <tool_description>Additional tools may become available through the Model Context Protocol (MCP) when servers are connected. These may include file operations, web scraping, data processing, and specialized geospatial analysis capabilities.</tool_description>\n`
    toolDescriptions += `    </tool_category>\n`
  }

  return toolDescriptions.trim()
}

/**
 * Convert MCP tool information to ToolDescription format
 * @param mcpToolName Tool name from MCP
 * @param mcpToolDescription Tool description from MCP
 * @param serverName Name of the MCP server
 * @returns ToolDescription object
 */
export function createMCPToolDescription(
  mcpToolName: string,
  mcpToolDescription: string,
  serverName: string
): ToolDescription {
  return {
    name: mcpToolName,
    description: mcpToolDescription,
    isMCP: true,
    mcpServer: serverName
  }
}
