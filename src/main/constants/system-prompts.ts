/**
 * System prompts for Arion AI assistant.
 */
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { generateToolDescriptions, type ToolDescription } from './tool-constants'

// Function to load the system prompt from XML file
function loadSystemPromptFromFile(fileName: string, mcpTools: ToolDescription[] = []): string {
  const promptsBasePath = path.join(app.getAppPath(), 'src', 'main', 'prompts')
  const promptPath = path.join(promptsBasePath, fileName)

  if (!fs.existsSync(promptPath)) {
    throw new Error(`System prompt file not found: ${promptPath}`)
  }

  const templateContent = fs.readFileSync(promptPath, 'utf8')
  // Replace the placeholder with dynamic tool descriptions
  const toolDescriptions = generateToolDescriptions(mcpTools)
  return templateContent.replace('{DYNAMIC_TOOL_DESCRIPTIONS}', toolDescriptions)
}

// Export function to get system prompt with optional MCP tools
export function getArionSystemPrompt(mcpTools: ToolDescription[] = []): string {
  return loadSystemPromptFromFile('arion-system-prompt.xml', mcpTools)
}

// Export the basic system prompt for backward compatibility
export const ARION_SYSTEM_PROMPT = loadSystemPromptFromFile('arion-system-prompt.xml')
