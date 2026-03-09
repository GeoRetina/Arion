import { z } from 'zod'

export const runCustomAnalysisWithCodexToolName = 'run_custom_analysis_with_codex'

export const RunCustomAnalysisWithCodexParamsSchema = z.object({
  goal: z
    .string()
    .min(1)
    .describe(
      'The custom geospatial analysis or coding task Codex should perform inside a managed workspace.'
    ),
  filePaths: z
    .array(z.string())
    .optional()
    .describe('Optional local file paths that Arion should copy into the Codex workspace.'),
  layerIds: z
    .array(z.string())
    .optional()
    .describe('Optional layer IDs from the current map runtime snapshot to stage for Codex.'),
  expectedOutputs: z
    .array(z.string())
    .optional()
    .describe('Optional artifact list or deliverables Codex should aim to create.'),
  importPreference: z
    .enum(['none', 'suggest'])
    .optional()
    .describe('Whether Arion should avoid import hints or suggest useful outputs to import.'),
  model: z.string().nullable().optional().describe('Optional Codex model override for this run.'),
  reasoningEffort: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('Optional Codex reasoning effort override for this run.')
})

export type RunCustomAnalysisWithCodexParams = z.infer<
  typeof RunCustomAnalysisWithCodexParamsSchema
>

export const runCustomAnalysisWithCodexToolDefinition = {
  description:
    'Runs a custom analysis with Codex inside an Arion-managed workspace, staging selected files and layers, streaming progress, and returning the generated artifacts.',
  inputSchema: RunCustomAnalysisWithCodexParamsSchema
}
