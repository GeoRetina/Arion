import { tool, dynamicTool } from 'ai'
import { z } from 'zod'
import type { RegisteredTool } from './tool-types'

export class ToolRegistry {
  private readonly registeredTools: Map<string, RegisteredTool> = new Map()

  public register(tool: RegisteredTool) {
    if (this.registeredTools.has(tool.name)) {
      return
    }

    if (
      !tool.definition ||
      typeof tool.definition.description !== 'string' ||
      !(tool.definition.inputSchema instanceof z.ZodType)
    ) {
      return
    }

    this.registeredTools.set(tool.name, tool)
  }

  public get(toolName: string) {
    return this.registeredTools.get(toolName)
  }

  public has(toolName: string) {
    return this.registeredTools.has(toolName)
  }

  public getAllToolNames(): string[] {
    return Array.from(this.registeredTools.keys())
  }

  public forEach(callback: (tool: RegisteredTool, name: string) => void) {
    this.registeredTools.forEach((value, key) => callback(value, key))
  }

  public createToolDefinitions(
    executeTool: (toolName: string, args: any) => Promise<any>,
    allowedToolIds?: string[]
  ): Record<string, any> {
    const llmTools: Record<string, any> = {}

    this.registeredTools.forEach((registeredToolEntry) => {
      if (allowedToolIds && !allowedToolIds.includes(registeredToolEntry.name)) {
        return
      }

      const toolFactory = registeredToolEntry.isDynamic ? dynamicTool : tool
      llmTools[registeredToolEntry.name] = toolFactory({
        description: registeredToolEntry.definition.description,
        inputSchema: registeredToolEntry.definition.inputSchema,
        execute: async (args: any) => executeTool(registeredToolEntry.name, args)
      })
    })

    return llmTools
  }
}
