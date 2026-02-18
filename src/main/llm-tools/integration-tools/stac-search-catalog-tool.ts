import { z } from 'zod'

export const stacSearchCatalogToolName = 'stac_search_catalog'

export const StacSearchCatalogParamsSchema = z.object({
  collections: z.array(z.string()).optional(),
  bbox: z.array(z.number()).min(4).max(6).optional(),
  datetime: z.string().optional(),
  query: z.record(z.unknown()).optional(),
  intersects: z.record(z.unknown()).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional()
})

export type StacSearchCatalogParams = z.infer<typeof StacSearchCatalogParamsSchema>

export const stacSearchCatalogToolDefinition = {
  description:
    'Searches the configured STAC integration for matching items using collection filters, bbox/datetime filters, and optional STAC query clauses.',
  inputSchema: StacSearchCatalogParamsSchema
}
