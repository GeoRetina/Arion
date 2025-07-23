import { z } from 'zod'

export const queryKnowledgeBaseToolName = 'query_knowledge_base'

// Schema for the parameters the LLM should provide when calling this tool
export const QueryKnowledgeBaseParamsSchema = z.object({
  query: z
    .string()
    .describe(
      'The specific question or topic to search for in the knowledge base. This should be detailed enough to allow for a focused search.'
    )
})
export type QueryKnowledgeBaseParams = z.infer<typeof QueryKnowledgeBaseParamsSchema>

// Tool definition for Vercel AI SDK
export const queryKnowledgeBaseToolDefinition = {
  description:
    "Queries the user's local knowledge base (uploaded documents) with the provided text query to find relevant information. Use this tool when the user asks a question that might be answerable from documents they have added, or when you need to retrieve specific information from those documents.",
  parameters: QueryKnowledgeBaseParamsSchema
}

// Example of what the tool's output structure might look like (the actual output to LLM will be a string)
export interface QueryKnowledgeBaseResult {
  status: 'success' | 'error' | 'no_results'
  message: string
  retrieved_context?: string
}
