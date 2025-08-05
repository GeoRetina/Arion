import { v4 as uuidv4 } from 'uuid'
import type { TaskAnalysis, Subtask } from '../types/orchestration-types'
import {
  ITaskAnalyzer,
  IPromptManager,
  IAgentSelector,
  IExecutionManager
} from './types/orchestration-interfaces'

export class TaskAnalyzer implements ITaskAnalyzer {
  constructor(
    private promptManager: IPromptManager,
    private agentSelector: IAgentSelector,
    private executionManager: IExecutionManager
  ) {}

  public async analyzeQuery(query: string, agentId: string, chatId: string): Promise<TaskAnalysis> {
    // Get available agents info
    const agentsInfo = await this.agentSelector.getAvailableAgentsInfo()

    // Load the analysis prompt from XML file
    const analysisPrompt = await this.promptManager.loadPrompt('task-analysis', {
      query,
      agents_info: agentsInfo
    })

    // Use the agent to analyze the query
    const executionResult = await this.executionManager.executeAgentWithPrompt(
      agentId,
      chatId,
      analysisPrompt
    )

    if (!executionResult.success) {
      // Return default analysis if execution failed
      return {
        taskType: 'unknown',
        requiredCapabilities: [],
        complexity: 'moderate',
        estimatedSubtasks: 1
      }
    }

    try {
      // Extract JSON from the text result
      const jsonMatch = executionResult.textResponse.match(/\{[\s\S]*\}/m)
      if (!jsonMatch) {
        throw new Error('Could not extract JSON analysis from LLM response')
      }

      const analysis = JSON.parse(jsonMatch[0]) as TaskAnalysis

      // Validate analysis
      if (!analysis.taskType || !analysis.requiredCapabilities || !analysis.complexity) {
        throw new Error('Incomplete task analysis')
      }

      // Ensure complexity is one of the allowed values
      if (!['simple', 'moderate', 'complex'].includes(analysis.complexity)) {
        analysis.complexity = 'moderate' // Default to moderate if invalid
      }

      return analysis
    } catch (error) {
      // Return default analysis if parsing fails
      return {
        taskType: 'unknown',
        requiredCapabilities: [],
        complexity: 'moderate',
        estimatedSubtasks: 1
      }
    }
  }

  public async decomposeTask(
    query: string,
    orchestratorAgentId: string,
    chatId: string
  ): Promise<Subtask[]> {
    // First analyze the query to determine if task decomposition is needed
    const taskAnalysis = await this.analyzeQuery(query, orchestratorAgentId, chatId)

    // If the task is simple, return a single subtask
    if (taskAnalysis.complexity === 'simple') {
      const subtask: Subtask = {
        id: uuidv4(),
        description: query,
        requiredCapabilities: taskAnalysis.requiredCapabilities,
        dependencies: [],
        status: 'pending'
      }
      return [subtask]
    }

    // Get available agents info
    const agentsInfo = await this.agentSelector.getAvailableAgentsInfo()

    // For moderate or complex tasks, use the orchestrator to decompose
    const decompositionPrompt = await this.promptManager.loadPrompt('task-decomposition', {
      query,
      agents_info: agentsInfo
    })

    // Execute the orchestrator agent with the decomposition prompt
    const executionResult = await this.executionManager.executeAgentWithPrompt(
      orchestratorAgentId,
      chatId,
      decompositionPrompt
    )

    if (!executionResult.success) {
      // Fallback to a single task
      return [
        {
          id: uuidv4(),
          description: query,
          requiredCapabilities: taskAnalysis.requiredCapabilities,
          dependencies: [],
          status: 'pending'
        }
      ]
    }

    try {
      // Extract JSON from the text result
      const jsonMatch = executionResult.textResponse.match(/\[[\s\S]*\]/m)
      if (!jsonMatch) {
        throw new Error('Could not extract JSON subtasks from LLM response')
      }

      const parsedSubtasks = JSON.parse(jsonMatch[0])

      // Convert to our Subtask interface
      const subtasks: Subtask[] = parsedSubtasks.map((st: any) => ({
        id: uuidv4(),
        description: st.description,
        requiredCapabilities: st.requiredCapabilities || [],
        dependencies:
          st.dependencies
            ?.map((depId: string | number) => {
              // Handle case where dependencies might be numeric indices
              if (typeof depId === 'number') {
                return parsedSubtasks[depId - 1]?.id || ''
              }
              return depId
            })
            .filter((id: string) => id !== '') || [],
        status: 'pending'
      }))

      return subtasks
    } catch (error) {
      // Fallback to a single task if parsing fails
      return [
        {
          id: uuidv4(),
          description: query,
          requiredCapabilities: taskAnalysis.requiredCapabilities,
          dependencies: [],
          status: 'pending'
        }
      ]
    }
  }
}
