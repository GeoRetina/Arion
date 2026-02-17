import {
  queryKnowledgeBaseToolDefinition,
  queryKnowledgeBaseToolName,
  type QueryKnowledgeBaseParams
} from '../../../llm-tools/knowledge-base-tools/query-knowledge-base-tool'
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
}
