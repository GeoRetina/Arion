/**
 * System prompts for Arion AI assistant.
 */
import * as fs from 'fs'
import { app } from 'electron'
import { generateToolDescriptions, type ToolDescription } from './tool-constants'
import { resolvePromptPath } from '../lib/prompt-paths'
import { escapeXmlAttribute, escapeXmlText } from '../lib/xml-escape'

export interface RuntimeDescriptorLike {
  id: string
  name: string
  description: string
}

// Function to load a prompt XML file and return its contents
function loadPromptFile(fileName: string): string {
  const promptPath = resolvePromptPath(fileName, {
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath
  })
  return fs.readFileSync(promptPath, 'utf8')
}

function generateRuntimeDescriptionsXml(runtimes: RuntimeDescriptorLike[]): string {
  if (runtimes.length === 0) return ''

  return runtimes
    .map((runtime) =>
      [
        `    <runtime id="${escapeXmlAttribute(runtime.id)}">`,
        `      <name>${escapeXmlText(runtime.name)}</name>`,
        `      <description>${escapeXmlText(runtime.description)}</description>`,
        '    </runtime>'
      ].join('\n')
    )
    .join('\n')
}

// Function to load the system prompt from XML file
function loadSystemPromptFromFile(
  fileName: string,
  mcpTools: ToolDescription[] = [],
  agentToolAccess?: string[],
  runtimes: RuntimeDescriptorLike[] = []
): string {
  const templateContent = loadPromptFile(fileName)
  // Replace the placeholder with dynamic tool descriptions
  const toolDescriptions = generateToolDescriptions(mcpTools, agentToolAccess)
  let prompt = templateContent.replace('{DYNAMIC_TOOL_DESCRIPTIONS}', toolDescriptions)

  // Append supplementary prompt modules
  const hasIntegrationTools = !agentToolAccess || agentToolAccess.includes('run_external_analysis')

  if (hasIntegrationTools && runtimes.length > 0) {
    try {
      const template = loadPromptFile('external-runtimes.xml')
      const runtimeDescriptions = generateRuntimeDescriptionsXml(runtimes)
      const externalRuntimesPrompt = template.replace(
        '{DYNAMIC_RUNTIME_DESCRIPTIONS}',
        runtimeDescriptions
      )
      prompt += '\n\n' + externalRuntimesPrompt
    } catch {
      // External runtimes prompt module not available; skip silently.
    }
  }

  return prompt
}

// Export function to get system prompt with optional MCP tools and external runtimes
export function getArionSystemPrompt(
  mcpTools: ToolDescription[] = [],
  agentToolAccess?: string[],
  runtimes: RuntimeDescriptorLike[] = []
): string {
  return loadSystemPromptFromFile('arion-system-prompt.xml', mcpTools, agentToolAccess, runtimes)
}

// Export the basic system prompt for backward compatibility
export const ARION_SYSTEM_PROMPT = loadSystemPromptFromFile('arion-system-prompt.xml')
