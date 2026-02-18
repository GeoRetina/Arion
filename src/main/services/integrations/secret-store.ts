import * as keytar from 'keytar'
import type { IntegrationId } from '../../../shared/ipc-types'
import { INTEGRATION_SECRET_SERVICE_NAME } from './constants'
import { parseJsonRecord } from './utils'

export class IntegrationSecretStore {
  public async getSecretConfig(id: IntegrationId): Promise<Record<string, unknown>> {
    const raw = await keytar.getPassword(INTEGRATION_SECRET_SERVICE_NAME, id)
    if (!raw) {
      return {}
    }
    return parseJsonRecord(raw)
  }

  public async setSecretConfig(
    id: IntegrationId,
    secretConfig: Record<string, unknown>
  ): Promise<void> {
    if (Object.keys(secretConfig).length === 0) {
      await keytar.deletePassword(INTEGRATION_SECRET_SERVICE_NAME, id)
      return
    }
    await keytar.setPassword(INTEGRATION_SECRET_SERVICE_NAME, id, JSON.stringify(secretConfig))
  }
}
