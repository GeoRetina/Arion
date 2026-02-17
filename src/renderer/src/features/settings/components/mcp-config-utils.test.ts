import { describe, expect, it } from 'vitest'
import { buildNormalizedConfig, sanitizeConfig } from './mcp-config-utils'
import type { McpServerConfig } from '../../../../../shared/ipc-types'

const baseConfig: Omit<McpServerConfig, 'id'> = {
  name: 'geo-tools',
  url: '  https://example.com/mcp  ',
  command: '  python  ',
  args: ['  --stdio ', '   '],
  enabled: true
}

describe('sanitizeConfig', () => {
  it('sanitizes stdio config by trimming command/args and clearing url', () => {
    const result = sanitizeConfig(baseConfig, 'stdio')

    expect(result).toEqual({
      ...baseConfig,
      command: 'python',
      url: '',
      args: ['--stdio']
    })
  })

  it('sanitizes http config by clearing command and ensuring args array', () => {
    const result = sanitizeConfig({ ...baseConfig, args: undefined }, 'http')

    expect(result.command).toBe('')
    expect(result.url).toBe('https://example.com/mcp')
    expect(result.args).toEqual([])
  })
})

describe('buildNormalizedConfig', () => {
  it('returns an error when config is missing', () => {
    const result = buildNormalizedConfig({
      editingConfig: null,
      inputMode: 'form',
      jsonString: '',
      isEditingExistingServer: false,
      connectionType: 'http'
    })

    expect(result).toEqual({
      config: null,
      error: 'No configuration to process.'
    })
  })

  it('returns an error when json input is invalid', () => {
    const result = buildNormalizedConfig({
      editingConfig: { id: 'x', ...baseConfig },
      inputMode: 'json',
      jsonString: '{bad json',
      isEditingExistingServer: true,
      connectionType: 'http'
    })

    expect(result).toEqual({
      config: null,
      error: 'Invalid JSON configuration.'
    })
  })

  it('strips id from json payload and sanitizes values', () => {
    const result = buildNormalizedConfig({
      editingConfig: { id: 'server_1', ...baseConfig },
      inputMode: 'json',
      jsonString:
        '{"id":"new-id","name":"srv","command":" node ","url":" https://mcp.test ","args":[" --flag "],"enabled":true}',
      isEditingExistingServer: true,
      connectionType: 'http'
    })

    expect(result).toEqual({
      config: {
        name: 'srv',
        command: '',
        url: 'https://mcp.test',
        args: ['--flag'],
        enabled: true
      }
    })
  })

  it('uses form mode config when not editing json', () => {
    const result = buildNormalizedConfig({
      editingConfig: { id: 'server_2', ...baseConfig },
      inputMode: 'form',
      jsonString: '',
      isEditingExistingServer: true,
      connectionType: 'stdio'
    })

    expect(result).toEqual({
      config: {
        ...baseConfig,
        command: 'python',
        url: '',
        args: ['--stdio']
      }
    })
  })
})
