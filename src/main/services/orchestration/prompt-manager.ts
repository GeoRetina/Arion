import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { IPromptManager } from './types/orchestration-interfaces'

export class PromptManager implements IPromptManager {
  private promptsBasePath: string

  constructor() {
    this.promptsBasePath = path.join(app.getAppPath(), 'src', 'main', 'prompts')
    console.log('[PromptManager] Initialized with prompts path:', this.promptsBasePath)
  }

  public getPromptsBasePath(): string {
    return this.promptsBasePath
  }

  public async loadPrompt(
    promptName: string,
    replacements: Record<string, string>
  ): Promise<string> {
    try {
      const promptPath = path.join(this.promptsBasePath, `${promptName}.xml`)
      const promptXml = fs.readFileSync(promptPath, 'utf8')

      // Extract the content between CDATA tags
      const cdataMatch = promptXml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/m)
      if (!cdataMatch) {
        throw new Error(`Could not extract CDATA from prompt file: ${promptName}`)
      }

      let promptTemplate = cdataMatch[1]

      // Replace placeholders with values
      Object.entries(replacements).forEach(([key, value]) => {
        const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
        promptTemplate = promptTemplate.replace(placeholder, value)
      })

      return promptTemplate
    } catch (error) {
      console.error(`[PromptManager] Error loading prompt ${promptName}:`, error)
      return `Unable to load prompt ${promptName}. Please provide a response.`
    }
  }
}