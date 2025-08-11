import { z } from 'zod'

export const openMapSidebarToolName = 'open_map_sidebar'

// Define the parameters schema for the tool, even if empty
// For this tool, no parameters are needed to open the sidebar.
export const OpenMapSidebarParamsSchema = z.object({})

export type OpenMapSidebarParams = z.infer<typeof OpenMapSidebarParamsSchema>

/**
 * Tool definition for the Vercel AI SDK.
 * This describes the tool to the LLM.
 */
export const openMapSidebarToolDefinition = {
  description:
    'Opens the map sidebar in the application UI if it is currently closed. Use this to show map-related information or visualizations to the user when appropriate, for example, after adding a new layer to the map or when the user asks to see the map.',
  inputSchema: OpenMapSidebarParamsSchema
  // The execute function will be bound by the LlmToolService when registering the tool.
}
