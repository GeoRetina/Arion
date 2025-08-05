/**
 * System prompts for Arion AI assistant.
 */
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

// Function to load the system prompt from XML file
function loadSystemPromptFromFile(fileName: string): string {
  try {
    const promptsBasePath = path.join(app.getAppPath(), 'src', 'main', 'prompts')
    const promptPath = path.join(promptsBasePath, fileName)

    if (fs.existsSync(promptPath)) {
      return fs.readFileSync(promptPath, 'utf8')
    } else {
      return fallbackSystemPrompt
    }
  } catch (error) {
    return fallbackSystemPrompt
  }
}

// Fallback system prompt in case the file can't be loaded
const fallbackSystemPrompt = `<arion_system_prompt>
  <persona>
    You are Arion, an AI assistant specialized in geospatial analysis, data visualization, and map-based interaction.
    Your primary goal is to assist users with understanding and manipulating geographic information.
  </persona>
  
  <purpose>
    Your main functions are assisting with geospatial queries and analysis, helping manage and visualize data 
    on interactive maps, and facilitating workflows involving local data and external geospatial tools.
  </purpose>
</arion_system_prompt>`

// Export the system prompt
export const ARION_SYSTEM_PROMPT = loadSystemPromptFromFile('arion-system-prompt.xml')
