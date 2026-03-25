/**
 * Tool constants and definitions for dynamic system prompt generation.
 * This file provides a centralized way to define tool categories and descriptions
 * without hardcoding them in the system prompt.
 */

import { escapeXmlAttribute, escapeXmlText } from '../lib/xml-escape'

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
        description: 'Style live map layers with MapLibre paint, layout, and filter expressions'
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
      },
      {
        name: 'search_workspace_memories',
        description:
          'Search workspace memory for prior outcomes, decisions, preferences, and historical context'
      },
      {
        name: 'get_workspace_memory',
        description:
          'Retrieve a specific workspace memory entry by ID after searching for relevant matches'
      },
      {
        name: 'create_workspace_memory',
        description:
          'Create an explicit durable workspace memory entry when the user asks to remember information'
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
        description:
          'Call a listed specialized agent for domain-specific tasks. Use only the exact agent_handle from the AVAILABLE SPECIALIZED AGENTS section and never invent agent handles or IDs.'
      }
    ]
  },
  {
    name: 'Integrations',
    tools: [
      {
        name: 'qgis_run_processing',
        description:
          'Run an approved QGIS Processing algorithm with explicit parameters against local datasets, chain multi-step analyses by reusing the returned workflowId plus artifact handles between runs, inspect generated outputs, and import only the map layers the user actually wants to see when final datasets are written to named GeoPackage, GeoJSON, or GeoTIFF files'
      },
      {
        name: 'qgis_describe_algorithm',
        description:
          'Inspect the exact parameters and outputs for a QGIS Processing algorithm before running it'
      },
      {
        name: 'qgis_list_algorithms',
        description:
          'Discover available QGIS Processing algorithms from the configured local QGIS installation'
      },
      {
        name: 'run_external_analysis',
        description:
          'Run a custom analysis with an external coding runtime inside an Arion-managed workspace, staging files and layers, and returning generated artifacts'
      }
    ]
  }
]

/**
 * Generate tool descriptions for system prompt, including both built-in and MCP tools
 * @param mcpTools Optional array of MCP tools to include
 * @param agentToolAccess Optional array of tool names that the agent has access to
 * @returns Formatted tool descriptions for system prompt
 */
export function generateToolDescriptions(
  mcpTools: ToolDescription[] = [],
  agentToolAccess?: string[]
): string {
  const sections: string[] = []

  const pushToolCategory = (
    categoryName: string,
    tools: ToolDescription[],
    label = 'tool'
  ): void => {
    if (tools.length === 0) {
      return
    }

    const lines = [`    <tool_category name="${escapeXmlAttribute(categoryName)}">`]
    for (const tool of tools) {
      lines.push(
        `      <tool_description>${escapeXmlText(tool.description)} (${label}: ${escapeXmlText(tool.name)}).</tool_description>`
      )
    }
    lines.push('    </tool_category>')
    sections.push(lines.join('\n'))
  }

  // Add built-in tool categories
  for (const category of BUILTIN_TOOL_CATEGORIES) {
    // Filter tools based on agent tool access if provided
    const categoryTools =
      agentToolAccess && agentToolAccess.length > 0
        ? category.tools.filter((tool) => agentToolAccess.includes(tool.name))
        : category.tools

    pushToolCategory(category.name, categoryTools)
  }

  // Add MCP tools if any are available
  if (mcpTools.length > 0) {
    // Group MCP tools by server
    const mcpByServer: { [server: string]: ToolDescription[] } = {}
    const ungroupedMcp: ToolDescription[] = []

    // Filter MCP tools based on agent tool access if provided
    const filteredMcpTools =
      agentToolAccess && agentToolAccess.length > 0
        ? mcpTools.filter((tool) => agentToolAccess.includes(tool.name))
        : mcpTools

    for (const tool of filteredMcpTools) {
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
      pushToolCategory(`MCP Tools - ${serverName}`, serverTools, 'MCP tool')
    }

    // Add ungrouped MCP tools
    pushToolCategory('MCP Tools - Additional', ungroupedMcp, 'MCP tool')
  } else {
    // Add note about potential MCP tools when none are available
    sections.push(
      [
        '    <tool_category name="Dynamic MCP Tools">',
        '      <tool_description>Additional tools may become available through the Model Context Protocol (MCP) when servers are connected. These may include file operations, web scraping, data processing, and specialized geospatial analysis capabilities.</tool_description>',
        '    </tool_category>'
      ].join('\n')
    )
  }

  return sections.join('\n\n').trim()
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
