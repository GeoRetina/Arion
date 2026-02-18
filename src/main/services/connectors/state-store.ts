import Database from 'better-sqlite3'
import type { IntegrationId, IntegrationStatus } from '../../../shared/ipc-types'

export interface IntegrationConfigRow {
  id: string
  status: IntegrationStatus
  last_used: string
  message: string | null
  checked_at: string | null
  has_config: number
  public_config: string
}

export interface UpsertIntegrationRowInput {
  id: IntegrationId
  status: IntegrationStatus
  lastUsed: string
  message: string | null
  checkedAt: string | null
  hasConfig: boolean
  publicConfig: Record<string, unknown>
}

export class IntegrationStateStore {
  private readonly db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.initialize()
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS integration_configs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'not-configured',
        last_used TEXT NOT NULL DEFAULT 'Never',
        message TEXT,
        checked_at TEXT,
        has_config INTEGER NOT NULL DEFAULT 0,
        public_config TEXT NOT NULL DEFAULT '{}'
      );
    `)
  }

  public getAllRows(): IntegrationConfigRow[] {
    return this.db
      .prepare(
        'SELECT id, status, last_used, message, checked_at, has_config, public_config FROM integration_configs'
      )
      .all() as IntegrationConfigRow[]
  }

  public getRowById(id: IntegrationId): IntegrationConfigRow | null {
    const row = this.db
      .prepare(
        'SELECT id, status, last_used, message, checked_at, has_config, public_config FROM integration_configs WHERE id = ?'
      )
      .get(id) as IntegrationConfigRow | undefined
    return row || null
  }

  public upsertRow(input: UpsertIntegrationRowInput): void {
    this.db
      .prepare(
        `
        INSERT INTO integration_configs (id, status, last_used, message, checked_at, has_config, public_config)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          last_used = excluded.last_used,
          message = excluded.message,
          checked_at = excluded.checked_at,
          has_config = excluded.has_config,
          public_config = excluded.public_config
      `
      )
      .run(
        input.id,
        input.status,
        input.lastUsed,
        input.message,
        input.checkedAt,
        input.hasConfig ? 1 : 0,
        JSON.stringify(input.publicConfig)
      )
  }

  public close(): void {
    this.db.close()
  }
}
