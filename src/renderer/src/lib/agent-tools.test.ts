import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchAvailableTools,
  filterUnassignedTools,
  getAssignedToolsFromAgents,
  getAvailableUnassignedTools
} from './agent-tools'

describe('agent-tools utilities', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('fetches available tools from preload bridge', async () => {
    const getAllAvailable = vi.fn(async () => ['buffer', 'query_db'])
    Object.defineProperty(globalThis, 'window', {
      value: { ctg: { tools: { getAllAvailable } } },
      configurable: true
    })

    await expect(fetchAvailableTools()).resolves.toEqual(['buffer', 'query_db'])
    expect(getAllAvailable).toHaveBeenCalledTimes(1)
  })

  it('returns empty list and logs when tool fetch fails', async () => {
    const getAllAvailable = vi.fn(async () => {
      throw new Error('down')
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    Object.defineProperty(globalThis, 'window', {
      value: { ctg: { tools: { getAllAvailable } } },
      configurable: true
    })

    await expect(fetchAvailableTools()).resolves.toEqual([])
    expect(errorSpy).toHaveBeenCalled()
  })

  it('collects assigned tools from toolAccess and capabilities', () => {
    const assigned = getAssignedToolsFromAgents([
      {
        toolAccess: ['buffer', 'query_db'],
        capabilities: [{ tools: ['buffer', 'export_map'] }]
      },
      {
        capabilities: [{ tools: ['summarize'] }]
      }
    ])

    expect(assigned).toEqual(new Set(['buffer', 'query_db', 'export_map', 'summarize']))
    expect(filterUnassignedTools(['buffer', 'summarize', 'new_tool'], assigned)).toEqual([
      'new_tool'
    ])
  })

  it('returns available unassigned tools', async () => {
    const getAllAvailable = vi.fn(async () => ['buffer', 'query_db', 'new_tool'])
    Object.defineProperty(globalThis, 'window', {
      value: { ctg: { tools: { getAllAvailable } } },
      configurable: true
    })

    const result = await getAvailableUnassignedTools([
      {
        toolAccess: ['buffer'],
        capabilities: [{ tools: ['query_db'] }]
      }
    ])

    expect(result).toEqual(['new_tool'])
  })
})
