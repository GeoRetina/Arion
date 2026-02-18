import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { ConnectorPolicyConfig } from '../../../../../shared/ipc-types'

interface UseConnectorPolicyConfigResult {
  connectorPolicyConfig: ConnectorPolicyConfig | null
  connectorPolicyBackendsInput: string
  connectorPolicyDenylistInput: string
  connectorSensitiveCapabilitiesInput: string
  connectorBlockedMcpToolNamesInput: string
  isConnectorPolicyLoading: boolean
  isSavingConnectorPolicy: boolean
  setConnectorPolicyBackendsInput: (value: string) => void
  setConnectorPolicyDenylistInput: (value: string) => void
  setConnectorSensitiveCapabilitiesInput: (value: string) => void
  setConnectorBlockedMcpToolNamesInput: (value: string) => void
  updateConnectorPolicyConfig: (
    updater: (config: ConnectorPolicyConfig) => ConnectorPolicyConfig
  ) => void
  saveConnectorPolicyConfig: () => Promise<void>
}

const parseCommaSeparated = (value: string): string[] => {
  const unique = new Set<string>()

  for (const part of value.split(/[\n,]/g)) {
    const normalized = part.trim()
    if (normalized.length > 0) {
      unique.add(normalized)
    }
  }

  return Array.from(unique.values())
}

const parseBackendList = (value: string): Array<'native' | 'mcp' | 'plugin'> => {
  return parseCommaSeparated(value).filter(
    (backend): backend is 'native' | 'mcp' | 'plugin' =>
      backend === 'native' || backend === 'mcp' || backend === 'plugin'
  )
}

export const useConnectorPolicyConfig = (): UseConnectorPolicyConfigResult => {
  const [connectorPolicyConfig, setConnectorPolicyConfig] = useState<ConnectorPolicyConfig | null>(
    null
  )
  const [connectorPolicyBackendsInput, setConnectorPolicyBackendsInput] = useState('')
  const [connectorPolicyDenylistInput, setConnectorPolicyDenylistInput] = useState('')
  const [connectorSensitiveCapabilitiesInput, setConnectorSensitiveCapabilitiesInput] = useState('')
  const [connectorBlockedMcpToolNamesInput, setConnectorBlockedMcpToolNamesInput] = useState('')
  const [isConnectorPolicyLoading, setIsConnectorPolicyLoading] = useState(true)
  const [isSavingConnectorPolicy, setIsSavingConnectorPolicy] = useState(false)

  const applyConfigToFormInputs = useCallback((config: ConnectorPolicyConfig): void => {
    setConnectorPolicyConfig(config)
    setConnectorPolicyBackendsInput((config.defaultAllowedBackends || []).join(', '))
    setConnectorPolicyDenylistInput((config.backendDenylist || []).join(', '))
    setConnectorSensitiveCapabilitiesInput((config.sensitiveCapabilities || []).join(', '))
    setConnectorBlockedMcpToolNamesInput((config.blockedMcpToolNames || []).join(', '))
  }, [])

  const updateConnectorPolicyConfig = useCallback(
    (updater: (config: ConnectorPolicyConfig) => ConnectorPolicyConfig): void => {
      setConnectorPolicyConfig((previous) => (previous ? updater(previous) : previous))
    },
    []
  )

  const loadConnectorPolicyConfig = useCallback(async (): Promise<void> => {
    setIsConnectorPolicyLoading(true)
    try {
      const config = await window.ctg.settings.getConnectorPolicyConfig()
      applyConfigToFormInputs(config)
    } catch {
      setConnectorPolicyConfig(null)
    } finally {
      setIsConnectorPolicyLoading(false)
    }
  }, [applyConfigToFormInputs])

  const saveConnectorPolicyConfig = useCallback(async (): Promise<void> => {
    if (!connectorPolicyConfig) {
      return
    }

    setIsSavingConnectorPolicy(true)
    try {
      const safeConfig: ConnectorPolicyConfig = {
        ...connectorPolicyConfig,
        defaultAllowedBackends: parseBackendList(connectorPolicyBackendsInput),
        backendDenylist: parseBackendList(connectorPolicyDenylistInput),
        sensitiveCapabilities: parseCommaSeparated(connectorSensitiveCapabilitiesInput),
        blockedMcpToolNames: parseCommaSeparated(connectorBlockedMcpToolNamesInput)
      }

      await window.ctg.settings.setConnectorPolicyConfig(safeConfig)
      const refreshed = await window.ctg.settings.getConnectorPolicyConfig()
      applyConfigToFormInputs(refreshed)
      toast.success('Connector policy saved')
    } catch (error) {
      toast.error('Failed to save connector policy', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    } finally {
      setIsSavingConnectorPolicy(false)
    }
  }, [
    applyConfigToFormInputs,
    connectorBlockedMcpToolNamesInput,
    connectorPolicyBackendsInput,
    connectorPolicyConfig,
    connectorPolicyDenylistInput,
    connectorSensitiveCapabilitiesInput
  ])

  useEffect(() => {
    void loadConnectorPolicyConfig()
  }, [loadConnectorPolicyConfig])

  return {
    connectorPolicyConfig,
    connectorPolicyBackendsInput,
    connectorPolicyDenylistInput,
    connectorSensitiveCapabilitiesInput,
    connectorBlockedMcpToolNamesInput,
    isConnectorPolicyLoading,
    isSavingConnectorPolicy,
    setConnectorPolicyBackendsInput,
    setConnectorPolicyDenylistInput,
    setConnectorSensitiveCapabilitiesInput,
    setConnectorBlockedMcpToolNamesInput,
    updateConnectorPolicyConfig,
    saveConnectorPolicyConfig
  }
}
