import { spawn, ChildProcess } from 'child_process'
import { MCPClientService, DiscoveredMcpTool } from './mcp-client-service'
// import { LLMProviderService } from './llmProvider.service'; // For later LLM config passing

// Interface for messages exchanged with the agent via stdio
interface AgentStdioMessage {
  type:
    | 'log'
    | 'tool_call_request'
    | 'tool_call_response'
    | 'error'
    | 'agent_response'
    | 'mcp_tools_list'
  payload: UnsafeAny
  requestId?: string // For correlating requests and responses
}

interface AgentConfig {
  agentId: string // Unique ID for this agent instance
  scriptPath: string // Absolute path to the Python agent script
  pythonExecutable?: string // Path to python executable if not default
  // Potentially add llmConfig, initialPrompt, etc.
}

export class AgentRunnerService {
  private mcpClientService: MCPClientService
  // private llmProviderService: LLMProviderService;
  private runningAgents: Map<string, ChildProcess> = new Map()

  constructor(
    mcpClientService: MCPClientService
    // llmProviderService: LLMProviderService
  ) {
    this.mcpClientService = mcpClientService
    // this.llmProviderService = llmProviderService;
  }

  public async spawnAgent(config: AgentConfig): Promise<string | null> {
    if (this.runningAgents.has(config.agentId)) {
      return config.agentId
    }

    const pythonPath = config.pythonExecutable || 'python3' // Default to python3
    const scriptArgs = [config.scriptPath] // Python script is the first arg to python interpreter

    try {
      const agentProcess = spawn(pythonPath, scriptArgs, {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'] // stdin, stdout, stderr, ipc (optional)
      })
      this.runningAgents.set(config.agentId, agentProcess)

      agentProcess.stdout?.on('data', (data) => {
        this.handleAgentStdioMessage(config.agentId, data, 'stdout')
      })

      agentProcess.stderr?.on('data', () => {})

      agentProcess.on('error', () => {
        this.runningAgents.delete(config.agentId)
        // TODO: Notify renderer or manage state about this failure
      })

      agentProcess.on('close', () => {
        this.runningAgents.delete(config.agentId)
        // TODO: Notify renderer or manage state
      })

      // Send initial MCP tool definitions to the agent
      await this.sendMcpToolsToAgent(config.agentId)

      return config.agentId
    } catch {
      return null
    }
  }

  private async sendMcpToolsToAgent(agentId: string): Promise<void> {
    const agentProcess = this.runningAgents.get(agentId)
    if (!agentProcess || !agentProcess.stdin) {
      return
    }

    const mcpTools: DiscoveredMcpTool[] = this.mcpClientService.getDiscoveredTools()
    // TODO: Format mcpTools into a schema the Python agent understands (e.g., LangChain tool schema)
    // For now, sending them as is.
    const message: AgentStdioMessage = {
      type: 'mcp_tools_list',
      payload: mcpTools
    }

    try {
      agentProcess.stdin.write(JSON.stringify(message) + '\n')
    } catch {
      void 0
    }
  }

  private handleAgentStdioMessage(
    agentId: string,
    data: Buffer,
    streamType: 'stdout' | 'stderr'
  ): void {
    const messageStr = data.toString().trim()
    // Assuming each line is a separate JSON message
    messageStr.split('\n').forEach(async (line) => {
      if (!line) return
      try {
        const message: AgentStdioMessage = JSON.parse(line)

        switch (message.type) {
          case 'log':
            break
          case 'tool_call_request':
            await this.handleAgentToolCallRequest(agentId, message)
            break
          // Handle other message types like 'agent_response', 'error' from agent, etc.
          default:
        }
      } catch {
        // If not JSON, treat as plain log from stdout
        if (streamType === 'stdout') {
          void 0
        } else {
          // stderr is already logged raw
          //
        }
      }
    })
  }

  private async handleAgentToolCallRequest(
    agentId: string,
    requestMessage: AgentStdioMessage
  ): Promise<void> {
    const agentProcess = this.runningAgents.get(agentId)
    if (!agentProcess || !agentProcess.stdin) {
      return
    }

    const { serverId, toolName, args } = requestMessage.payload // Assuming payload structure
    let responsePayload
    let success = false

    if (!serverId || !toolName) {
      responsePayload = { error: 'Invalid tool_call_request: missing serverId or toolName' }
    } else {
      try {
        const result = await this.mcpClientService.callTool(serverId, toolName, args)
        responsePayload = result
        success = true // Assuming callTool doesn't throw for operational errors but returns them in result if needed
      } catch (error) {
        responsePayload = {
          error: error instanceof Error ? error.message : 'Failed to execute MCP tool'
        }
      }
    }

    const responseMsg: AgentStdioMessage = {
      type: 'tool_call_response',
      requestId: requestMessage.requestId, // Echo back requestId for correlation
      payload: { success, ...responsePayload } // Send success status along with payload
    }

    try {
      agentProcess.stdin.write(JSON.stringify(responseMsg) + '\n')
    } catch {
      void 0
    }
  }

  public terminateAgent(agentId: string): boolean {
    const agentProcess = this.runningAgents.get(agentId)
    if (agentProcess) {
      agentProcess.kill() // Sends SIGTERM
      this.runningAgents.delete(agentId)
      return true
    }
    return false
  }

  public terminateAllAgents(): void {
    this.runningAgents.forEach((_process, agentId) => {
      this.terminateAgent(agentId)
    })
  }
}
