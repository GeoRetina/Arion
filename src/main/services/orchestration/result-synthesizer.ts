import type { AgentExecutionContext } from '../types/orchestration-types'
import { IResultSynthesizer, IPromptManager, IAgentSelector, IExecutionManager } from './types/orchestration-interfaces'

export class ResultSynthesizer implements IResultSynthesizer {
  constructor(
    private promptManager: IPromptManager,
    private agentSelector: IAgentSelector,
    private executionManager: IExecutionManager
  ) {}

  public async synthesizeResults(
    sessionId: string,
    context: AgentExecutionContext,
    orchestratorAgentId: string
  ): Promise<string> {
    console.log(`[ResultSynthesizer] Synthesizing results for session ${sessionId}`)

    // Get all subtask results
    const subtaskResults = context.subtasks.map((subtask) => ({
      description: subtask.description,
      status: subtask.status,
      result: subtask.result || 'No result'
    }))

    // Get available agents info
    const agentsInfo = await this.agentSelector.getAvailableAgentsInfo()

    // Use orchestrator agent to synthesize results
    const synthesisPrompt = await this.promptManager.loadPrompt('result-synthesis', {
      query: context.originalQuery,
      subtask_results: JSON.stringify(subtaskResults, null, 2),
      agents_info: agentsInfo
    })

    // Execute the orchestrator agent with the synthesis prompt
    const executionResult = await this.executionManager.executeAgentWithPrompt(
      orchestratorAgentId,
      context.chatId,
      synthesisPrompt
    )

    if (!executionResult.success) {
      console.error('[ResultSynthesizer] Error in result synthesis:', executionResult.error)
      return `Error synthesizing results: ${executionResult.error}`
    }

    console.log(`[ResultSynthesizer] Results synthesized for session ${sessionId}`)
    return executionResult.textResponse
  }
}