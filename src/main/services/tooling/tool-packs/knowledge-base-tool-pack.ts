import {
  createWorkspaceMemoryToolDefinition,
  createWorkspaceMemoryToolName,
  type CreateWorkspaceMemoryParams
} from '../../../llm-tools/knowledge-base-tools/create-workspace-memory-tool'
import {
  getWorkspaceMemoryToolDefinition,
  getWorkspaceMemoryToolName,
  type GetWorkspaceMemoryParams
} from '../../../llm-tools/knowledge-base-tools/get-workspace-memory-tool'
import {
  queryKnowledgeBaseToolDefinition,
  queryKnowledgeBaseToolName,
  type QueryKnowledgeBaseParams
} from '../../../llm-tools/knowledge-base-tools/query-knowledge-base-tool'
import {
  searchWorkspaceMemoriesToolDefinition,
  searchWorkspaceMemoriesToolName,
  type SearchWorkspaceMemoriesParams
} from '../../../llm-tools/knowledge-base-tools/search-workspace-memories-tool'
import type { ToolRegistry } from '../tool-registry'
import type { KnowledgeBaseService } from '../../knowledge-base-service'
import { MAX_RAG_RESULTS } from '../../../constants/llm-constants'

export interface KnowledgeBaseToolDependencies {
  getKnowledgeBaseService: () => KnowledgeBaseService | null
}

export function registerKnowledgeBaseTools(
  registry: ToolRegistry,
  deps: KnowledgeBaseToolDependencies
): void {
  const workspaceMemorySource = (memoryId: string): string => `workspace-memory:${memoryId}`
  const fallbackChatId = 'workspace-global'

  registry.register({
    name: queryKnowledgeBaseToolName,
    definition: queryKnowledgeBaseToolDefinition,
    category: 'knowledge_base',
    execute: async ({ args }) => {
      const knowledgeBaseService = deps.getKnowledgeBaseService()
      if (!knowledgeBaseService) {
        return {
          status: 'error',
          message: 'Knowledge Base Service is not configured. Cannot perform query.'
        }
      }
      try {
        const params = args as QueryKnowledgeBaseParams
        const queryEmbedding = await knowledgeBaseService.embedText(params.query)
        const similarChunks = await knowledgeBaseService.findSimilarChunks(
          queryEmbedding,
          MAX_RAG_RESULTS
        )

        if (similarChunks && similarChunks.length > 0) {
          const contextHeader = 'Relevant information from your knowledge base:'
          const chunkContents = similarChunks
            .map(
              (chunk, index) => `Chunk ${index + 1} (ID: ${chunk.document_id}/${chunk.id}):
${chunk.content}`
            )
            .join('\n\n')
          const retrieved_context = `${contextHeader}\n${chunkContents}\n\n`
          return {
            status: 'success',
            message: `Found ${similarChunks.length} relevant context snippets from the knowledge base.`,
            retrieved_context: retrieved_context
          }
        } else {
          return {
            status: 'no_results',
            message: 'No relevant information found in the knowledge base for your query.'
          }
        }
      } catch (error) {
        return {
          status: 'error',
          message: `Error querying knowledge base: ${error instanceof Error ? error.message : 'Unknown error'}.`
        }
      }
    }
  })

  registry.register({
    name: searchWorkspaceMemoriesToolName,
    definition: searchWorkspaceMemoriesToolDefinition,
    category: 'knowledge_base',
    execute: async ({ args, chatId }) => {
      const knowledgeBaseService = deps.getKnowledgeBaseService()
      if (!knowledgeBaseService) {
        return {
          status: 'error',
          message: 'Knowledge Base Service is not configured. Cannot search workspace memories.'
        }
      }

      try {
        const params = args as SearchWorkspaceMemoriesParams
        const query = typeof params.query === 'string' ? params.query.trim() : ''
        if (!query) {
          return {
            status: 'error',
            message: 'A non-empty "query" is required to search workspace memories.'
          }
        }

        const requestedLimit = Number.isFinite(params.limit) ? Number(params.limit) : 5
        const limit = Math.max(1, Math.min(Math.trunc(requestedLimit), 10))

        const memories = await knowledgeBaseService.findRelevantWorkspaceMemories({
          chatId,
          query,
          includeGlobal: true,
          limit,
          candidateLimit: Math.min(80, Math.max(limit * 6, 12)),
          scoreConfig: {
            similarityWeight: 0.75,
            recencyWeight: 0.25,
            halfLifeHours: 72
          }
        })

        if (!memories.length) {
          return {
            status: 'no_results',
            message: 'No relevant workspace memories were found for this query.'
          }
        }

        return {
          status: 'success',
          message: `Found ${memories.length} relevant workspace memories.`,
          results: memories.map((memory) => ({
            id: memory.id,
            summary: memory.summary,
            scope: memory.scope,
            memoryType: memory.memoryType,
            createdAt: memory.createdAt,
            score: memory.finalScore,
            source: workspaceMemorySource(memory.id)
          }))
        }
      } catch (error) {
        return {
          status: 'error',
          message: `Error searching workspace memories: ${error instanceof Error ? error.message : 'Unknown error'}.`
        }
      }
    }
  })

  registry.register({
    name: getWorkspaceMemoryToolName,
    definition: getWorkspaceMemoryToolDefinition,
    category: 'knowledge_base',
    execute: async ({ args, chatId }) => {
      const knowledgeBaseService = deps.getKnowledgeBaseService()
      if (!knowledgeBaseService) {
        return {
          status: 'error',
          message: 'Knowledge Base Service is not configured. Cannot fetch workspace memory.'
        }
      }

      try {
        const params = args as GetWorkspaceMemoryParams
        const memoryId = typeof params.memoryId === 'string' ? params.memoryId.trim() : ''
        if (!memoryId) {
          return {
            status: 'error',
            message: 'A valid "memoryId" is required.'
          }
        }

        const memory = await knowledgeBaseService.getWorkspaceMemoryById({
          id: memoryId,
          chatId,
          includeGlobal: true
        })

        if (!memory) {
          return {
            status: 'not_found',
            message: `Workspace memory "${memoryId}" was not found in this context.`
          }
        }

        const includeDetails = params.includeDetails !== false
        return {
          status: 'success',
          message: 'Workspace memory loaded.',
          memory: {
            id: memory.id,
            summary: memory.summary,
            scope: memory.scope,
            memoryType: memory.memoryType,
            createdAt: memory.createdAt,
            source: workspaceMemorySource(memory.id),
            ...(includeDetails ? { details: memory.details } : {})
          }
        }
      } catch (error) {
        return {
          status: 'error',
          message: `Error fetching workspace memory: ${error instanceof Error ? error.message : 'Unknown error'}.`
        }
      }
    }
  })

  registry.register({
    name: createWorkspaceMemoryToolName,
    definition: createWorkspaceMemoryToolDefinition,
    category: 'knowledge_base',
    execute: async ({ args, chatId, sourceIdPrefix = 'llm-tool' }) => {
      const knowledgeBaseService = deps.getKnowledgeBaseService()
      if (!knowledgeBaseService) {
        return {
          status: 'error',
          message: 'Knowledge Base Service is not configured. Cannot create workspace memory.'
        }
      }

      try {
        const params = args as CreateWorkspaceMemoryParams
        const summary = typeof params.summary === 'string' ? params.summary.trim() : ''
        if (!summary) {
          return {
            status: 'error',
            message: 'A non-empty "summary" is required to create workspace memory.'
          }
        }

        const scope = params.scope === 'chat' ? 'chat' : 'global'
        const memoryType = params.memoryType === 'tool_outcome' ? 'tool_outcome' : 'session_outcome'
        const normalizedChatId =
          typeof chatId === 'string' && chatId.trim().length > 0 ? chatId.trim() : ''
        if (scope === 'chat' && !normalizedChatId) {
          return {
            status: 'error',
            message: 'Chat-scoped workspace memory requires an active chat context.'
          }
        }

        const resolvedChatId = normalizedChatId || fallbackChatId
        const sourceKey = `${sourceIdPrefix}:workspace-memory:${Date.now()}:${Math.floor(Math.random() * 1_000_000)}`
        const detailsText = typeof params.details === 'string' ? params.details.trim() : ''

        const memory = await knowledgeBaseService.upsertWorkspaceMemoryEntry({
          chatId: resolvedChatId,
          scope,
          sourceKey,
          memoryType,
          summary,
          details: detailsText ? { note: detailsText } : undefined
        })

        if (!memory) {
          return {
            status: 'error',
            message: 'Workspace memory could not be created.'
          }
        }

        return {
          status: 'success',
          message: 'Workspace memory created.',
          memory: {
            id: memory.id,
            summary: memory.summary,
            scope: memory.scope,
            memoryType: memory.memoryType,
            createdAt: memory.createdAt,
            source: workspaceMemorySource(memory.id)
          }
        }
      } catch (error) {
        return {
          status: 'error',
          message: `Error creating workspace memory: ${error instanceof Error ? error.message : 'Unknown error'}.`
        }
      }
    }
  })
}
