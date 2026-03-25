import { describe, expect, it } from 'vitest'
import {
  buildDefaultIntegrationToolSuccessResult,
  buildQgisListAlgorithmsSuccessResult
} from './integration-tool-result-shapers'

describe('integration tool result shapers', () => {
  it('builds the default stable success shape', () => {
    expect(
      buildDefaultIntegrationToolSuccessResult({
        runId: 'run_1',
        backend: 'native',
        durationMs: 42,
        data: { returned: 2 },
        details: { source: 'native' }
      })
    ).toEqual({
      status: 'success',
      run_id: 'run_1',
      backend: 'native',
      duration_ms: 42,
      data: { returned: 2 },
      details: { source: 'native' }
    })
  })

  it('flattens the QGIS shortlist while preserving the original data payload', () => {
    expect(
      buildQgisListAlgorithmsSuccessResult({
        runId: 'run_qgis_list',
        backend: 'native',
        durationMs: 24,
        data: {
          operation: 'listAlgorithms',
          result: {
            algorithms: [
              {
                id: 'native:orderbyexpression',
                name: 'Order by expression',
                provider: 'native',
                supportedForExecution: true
              }
            ],
            totalAlgorithms: 180,
            matchedAlgorithms: 2,
            returnedAlgorithms: 1,
            truncated: true,
            filters: {
              query: 'extract the 10 longest line features',
              provider: 'native',
              limit: 10
            }
          }
        },
        details: { launcherPath: 'C:\\QGIS\\bin\\qgis_process-qgis.bat' }
      })
    ).toEqual({
      status: 'success',
      run_id: 'run_qgis_list',
      backend: 'native',
      duration_ms: 24,
      operation: 'listAlgorithms',
      algorithms: [
        {
          id: 'native:orderbyexpression',
          name: 'Order by expression',
          provider: 'native',
          supportedForExecution: true
        }
      ],
      shortlist: [
        {
          id: 'native:orderbyexpression',
          name: 'Order by expression',
          provider: 'native',
          supportedForExecution: true
        }
      ],
      total_algorithms: 180,
      matched_algorithms: 2,
      returned_algorithms: 1,
      truncated: true,
      filters: {
        query: 'extract the 10 longest line features',
        provider: 'native',
        limit: 10
      },
      data: {
        operation: 'listAlgorithms',
        result: {
          algorithms: [
            {
              id: 'native:orderbyexpression',
              name: 'Order by expression',
              provider: 'native',
              supportedForExecution: true
            }
          ],
          totalAlgorithms: 180,
          matchedAlgorithms: 2,
          returnedAlgorithms: 1,
          truncated: true,
          filters: {
            query: 'extract the 10 longest line features',
            provider: 'native',
            limit: 10
          }
        }
      },
      details: { launcherPath: 'C:\\QGIS\\bin\\qgis_process-qgis.bat' }
    })
  })
})
