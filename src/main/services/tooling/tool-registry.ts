import { tool, dynamicTool } from 'ai'
import { z } from 'zod'
import type { RegisteredTool } from './tool-types'

interface ExecutableToolDefinition extends Record<string, unknown> {
  execute: (args: unknown) => Promise<unknown> | unknown
}

export class ToolRegistry {
  private readonly registeredTools: Map<string, RegisteredTool> = new Map()

  public register(tool: RegisteredTool): void {
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

  public get(toolName: string): RegisteredTool | undefined {
    return this.registeredTools.get(toolName)
  }

  public has(toolName: string): boolean {
    return this.registeredTools.has(toolName)
  }

  public getAllToolNames(): string[] {
    return Array.from(this.registeredTools.keys())
  }

  public forEach(callback: (tool: RegisteredTool, name: string) => void): void {
    this.registeredTools.forEach((value, key) => callback(value, key))
  }

  public createToolDefinitions(
    executeTool: (toolName: string, args: unknown) => Promise<unknown>,
    allowedToolIds?: string[]
  ): Record<string, ExecutableToolDefinition> {
    const llmTools: Record<string, ExecutableToolDefinition> = {}

    this.registeredTools.forEach((registeredToolEntry) => {
      if (allowedToolIds && !allowedToolIds.includes(registeredToolEntry.name)) {
        return
      }

      const toolFactory = registeredToolEntry.isDynamic ? dynamicTool : tool
      llmTools[registeredToolEntry.name] = toolFactory({
        description: registeredToolEntry.definition.description,
        inputSchema: registeredToolEntry.definition.inputSchema,
        execute: async (args: unknown) => executeTool(registeredToolEntry.name, args)
      }) as unknown as ExecutableToolDefinition
    })

    return llmTools
  }
}
