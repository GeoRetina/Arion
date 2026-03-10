import { z } from 'zod'

export const runExternalAnalysisToolName = 'run_external_analysis'

export const RunExternalAnalysisParamsSchema = z.object({
  goal: z
    .string()
    .min(1)
    .describe(
      'The custom geospatial analysis or coding task the external runtime should perform inside a managed workspace.'
    ),
  preferredRuntime: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Optional preferred external runtime ID, such as codex. Omit this when Arion should choose.'
    ),
  filePaths: z
    .array(z.string())
    .optional()
    .describe('Optional local file paths that Arion should copy into the managed workspace.'),
  layerIds: z
    .array(z.string())
    .optional()
    .describe('Optional layer IDs from the current map runtime snapshot to stage.'),
  expectedOutputs: z
    .array(z.string())
    .optional()
    .describe('Optional artifact list or deliverables the runtime should aim to create.'),
  importPreference: z
    .enum(['none', 'suggest'])
    .optional()
    .describe('Whether Arion should avoid import hints or suggest useful outputs to import.'),
  model: z.string().nullable().optional().describe('Optional model override for this run.'),
  reasoningEffort: z
    .enum(['low', 'medium', 'high', 'xhigh'])
    .optional()
    .describe('Optional reasoning effort override for this run.')
})

export type RunExternalAnalysisParams = z.infer<typeof RunExternalAnalysisParamsSchema>

export const runExternalAnalysisToolDefinition = {
  description:
    'Runs a custom analysis with an external coding runtime inside an Arion-managed workspace, staging selected files and layers, streaming progress, and returning the generated artifacts.',
  inputSchema: RunExternalAnalysisParamsSchema
}
