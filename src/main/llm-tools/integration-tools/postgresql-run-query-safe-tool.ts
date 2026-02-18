import { z } from 'zod'

export const postgresqlRunQuerySafeToolName = 'postgresql_run_query_safe'

export const PostgreSQLRunQuerySafeParamsSchema = z.object({
  query: z.string().min(1),
  params: z.array(z.unknown()).optional(),
  rowLimit: z.number().int().min(1).max(1000).optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional()
})

export type PostgreSQLRunQuerySafeParams = z.infer<typeof PostgreSQLRunQuerySafeParamsSchema>

export const postgresqlRunQuerySafeToolDefinition = {
  description:
    'Executes a read-safe PostgreSQL query through the configured PostgreSQL/PostGIS connector. Only SELECT/WITH/EXPLAIN statements are allowed.',
  inputSchema: PostgreSQLRunQuerySafeParamsSchema
}
