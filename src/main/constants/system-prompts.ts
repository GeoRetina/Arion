/**
 * System prompts for Arion AI assistant.
 */
import * as fs from 'fs'
import { app } from 'electron'
import { generateToolDescriptions, type ToolDescription } from './tool-constants'
import { resolvePromptPath } from '../lib/prompt-paths'

// Function to load the system prompt from XML file
function loadSystemPromptFromFile(
  fileName: string,
  mcpTools: ToolDescription[] = [],
  agentToolAccess?: string[]
): string {
  const promptPath = resolvePromptPath(fileName, {
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath
  })

  const templateContent = fs.readFileSync(promptPath, 'utf8')
  // Replace the placeholder with dynamic tool descriptions
  const toolDescriptions = generateToolDescriptions(mcpTools, agentToolAccess)
  return templateContent.replace('{DYNAMIC_TOOL_DESCRIPTIONS}', toolDescriptions)
}

// Export function to get system prompt with optional MCP tools
export function getArionSystemPrompt(
  mcpTools: ToolDescription[] = [],
  agentToolAccess?: string[]
): string {
  return loadSystemPromptFromFile('arion-system-prompt.xml', mcpTools, agentToolAccess)
}

// Export the basic system prompt for backward compatibility
export const ARION_SYSTEM_PROMPT = loadSystemPromptFromFile('arion-system-prompt.xml')
