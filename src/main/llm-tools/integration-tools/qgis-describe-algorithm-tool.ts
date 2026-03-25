import { z } from 'zod'
import { qgisAlgorithmIdSchema, qgisTimeoutMsSchema } from './qgis-tool-common'

export const qgisDescribeAlgorithmToolName = 'qgis_describe_algorithm'

export const QgisDescribeAlgorithmParamsSchema = z.object({
  algorithmId: qgisAlgorithmIdSchema,
  timeoutMs: qgisTimeoutMsSchema
})

export type QgisDescribeAlgorithmParams = z.infer<typeof QgisDescribeAlgorithmParamsSchema>

export const qgisDescribeAlgorithmToolDefinition = {
  description:
    'Describes a QGIS Processing algorithm, including its exact parameter names, accepted value shapes, and output expectations. Use this after qgis_list_algorithms when you want to compare a few plausible candidates or before qgis_run_processing when you need to build the `parameters` object correctly.',
  inputSchema: QgisDescribeAlgorithmParamsSchema
}
