import type {
  IntegrationHealthCheckResult,
  QgisIntegrationConfig
} from '../../../../shared/ipc-types'
import { createHealthCheckResult } from './result'
import { QgisDiscoveryService } from '../../qgis/qgis-discovery-service'

export const checkQgis = async (
  config: QgisIntegrationConfig
): Promise<IntegrationHealthCheckResult> => {
  const discoveryService = new QgisDiscoveryService()
  const discovery = await discoveryService.discover(config)

  if (!discovery.preferredInstallation) {
    return createHealthCheckResult(
      false,
      discovery.status === 'not-found' ? 'not-configured' : 'error',
      buildFailureMessage(discovery.status, config),
      {
        discoveryStatus: discovery.status,
        diagnostics: discovery.diagnostics
      }
    )
  }

  const resolvedConfig: QgisIntegrationConfig = {
    detectionMode: config.detectionMode || 'auto',
    launcherPath: discovery.preferredInstallation.launcherPath,
    installRoot: discovery.preferredInstallation.installRoot,
    version: discovery.preferredInstallation.version,
    timeoutMs: config.timeoutMs,
    allowPluginAlgorithms: config.allowPluginAlgorithms,
    lastVerifiedAt: new Date().toISOString()
  }

  const installations = discovery.installations.map((installation) => ({
    launcherPath: installation.launcherPath,
    installRoot: installation.installRoot,
    version: installation.version,
    platform: installation.platform,
    source: installation.source,
    diagnostics: installation.diagnostics
  }))

  return createHealthCheckResult(
    true,
    'connected',
    buildSuccessMessage(discovery.status, discovery.preferredInstallation.version),
    {
      discoveryStatus: discovery.status,
      preferredInstallation: discovery.preferredInstallation,
      installations,
      diagnostics: discovery.diagnostics,
      resolvedConfig
    }
  )
}

function buildFailureMessage(
  status: 'found' | 'not-found' | 'invalid' | 'multiple',
  config: QgisIntegrationConfig
): string {
  if (status === 'invalid' && config.launcherPath) {
    return `Configured QGIS launcher is invalid: ${config.launcherPath}`
  }

  return 'QGIS was not found on this machine. Install QGIS or provide a valid qgis_process launcher path.'
}

function buildSuccessMessage(
  status: 'found' | 'not-found' | 'invalid' | 'multiple',
  version?: string
): string {
  if (status === 'multiple') {
    return version
      ? `Multiple QGIS installations were found. Using QGIS ${version}.`
      : 'Multiple QGIS installations were found. Using the preferred verified launcher.'
  }

  return version ? `QGIS ${version} is ready.` : 'QGIS is ready.'
}
