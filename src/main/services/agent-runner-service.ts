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
  payload: any
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
    console.log('[AgentRunnerService] Initialized')
  }

  public async spawnAgent(config: AgentConfig): Promise<string | null> {
    if (this.runningAgents.has(config.agentId)) {
      console.warn(`[AgentRunnerService] Agent with ID ${config.agentId} is already running.`)
      return config.agentId
    }

    const pythonPath = config.pythonExecutable || 'python3' // Default to python3
    const scriptArgs = [config.scriptPath] // Python script is the first arg to python interpreter

    console.log(
      `[AgentRunnerService] Spawning agent ${config.agentId}: ${pythonPath} ${scriptArgs.join(' ')}`
    )

    try {
      const agentProcess = spawn(pythonPath, scriptArgs, {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'] // stdin, stdout, stderr, ipc (optional)
      })
      this.runningAgents.set(config.agentId, agentProcess)

      agentProcess.stdout?.on('data', (data) => {
        this.handleAgentStdioMessage(config.agentId, data, 'stdout')
      })

      agentProcess.stderr?.on('data', (data) => {
        console.error(
          `[AgentRunnerService] Stderr from agent ${config.agentId}: ${data.toString()}`
        )
      })

      agentProcess.on('error', (err) => {
        console.error(`[AgentRunnerService] Failed to start agent ${config.agentId}:`, err)
        this.runningAgents.delete(config.agentId)
        // TODO: Notify renderer or manage state about this failure
      })

      agentProcess.on('close', (code) => {
        console.log(`[AgentRunnerService] Agent ${config.agentId} exited with code ${code}`)
        this.runningAgents.delete(config.agentId)
        // TODO: Notify renderer or manage state
      })

      console.log(`[AgentRunnerService] Agent ${config.agentId} spawned successfully.`)

      // Send initial MCP tool definitions to the agent
      await this.sendMcpToolsToAgent(config.agentId)

      return config.agentId
    } catch (error) {
      console.error(`[AgentRunnerService] Error spawning agent ${config.agentId}:`, error)
      return null
    }
  }

  private async sendMcpToolsToAgent(agentId: string): Promise<void> {
    const agentProcess = this.runningAgents.get(agentId)
    if (!agentProcess || !agentProcess.stdin) {
      console.error(
        `[AgentRunnerService] Cannot send tools to agent ${agentId}: process or stdin not available.`
      )
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
      console.log(
        `[AgentRunnerService] Sent MCP tools list to agent ${agentId}:`,
        mcpTools.length,
        'tools'
      )
    } catch (error) {
      console.error(`[AgentRunnerService] Error writing tools to agent ${agentId} stdin:`, error)
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
        console.log(`[AgentRunnerService] Received from agent ${agentId} (${streamType}):`, message)

        switch (message.type) {
          case 'log':
            console.log(`[Agent ${agentId} Log]:`, message.payload)
            break
          case 'tool_call_request':
            await this.handleAgentToolCallRequest(agentId, message)
            break
          // Handle other message types like 'agent_response', 'error' from agent, etc.
          default:
            console.warn(
              `[AgentRunnerService] Unknown message type from agent ${agentId}: ${message.type}`
            )
        }
      } catch (error) {
        // If not JSON, treat as plain log from stdout
        if (streamType === 'stdout') {
          console.log(`[Agent ${agentId} Raw Output]: ${line}`)
        } else {
          // stderr is already logged raw
          // console.error(`[AgentRunnerService] Error parsing message from agent ${agentId} or non-JSON output on stderr: ${line}`, error);
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
      console.error(
        `[AgentRunnerService] Agent ${agentId} not found or stdin not available for tool call response.`
      )
      return
    }

    const { serverId, toolName, args } = requestMessage.payload // Assuming payload structure
    let responsePayload
    let success = false

    if (!serverId || !toolName) {
      console.error(
        '[AgentRunnerService] Invalid tool_call_request from agent: missing serverId or toolName',
        requestMessage.payload
      )
      responsePayload = { error: 'Invalid tool_call_request: missing serverId or toolName' }
    } else {
      try {
        console.log(
          `[AgentRunnerService] Agent ${agentId} requesting tool call: ${toolName} on server ${serverId} with args:`,
          args
        )
        const result = await this.mcpClientService.callTool(serverId, toolName, args)
        responsePayload = result
        success = true // Assuming callTool doesn't throw for operational errors but returns them in result if needed
        console.log(
          `[AgentRunnerService] Tool call ${toolName} for agent ${agentId} result:`,
          result
        )
      } catch (error) {
        console.error(
          `[AgentRunnerService] Error calling MCP tool ${toolName} for agent ${agentId}:`,
          error
        )
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
    } catch (error) {
      console.error(
        `[AgentRunnerService] Error writing tool response to agent ${agentId} stdin:`,
        error
      )
    }
  }

  public terminateAgent(agentId: string): boolean {
    const agentProcess = this.runningAgents.get(agentId)
    if (agentProcess) {
      console.log(`[AgentRunnerService] Terminating agent ${agentId}...`)
      agentProcess.kill() // Sends SIGTERM
      this.runningAgents.delete(agentId)
      return true
    }
    console.warn(`[AgentRunnerService] Attempted to terminate non-existent agent ${agentId}.`)
    return false
  }

  public terminateAllAgents(): void {
    console.log('[AgentRunnerService] Terminating all running agents...')
    this.runningAgents.forEach((_process, agentId) => {
      this.terminateAgent(agentId)
    })
    console.log('[AgentRunnerService] All agents terminated.')
  }
}
