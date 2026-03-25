import { createRequire } from 'node:module'

const loadModule = createRequire(import.meta.url)

export interface QgisSqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): QgisSqliteStatement
  close(): void
}

export interface QgisSqliteStatement {
  run(...params: unknown[]): unknown
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown
}

export function createQgisSqliteDatabase(location: string): QgisSqliteDatabase {
  const betterSqliteDatabase = tryCreateBetterSqliteDatabase(location)
  if (betterSqliteDatabase) {
    return betterSqliteDatabase
  }

  const nodeSqliteDatabase = tryCreateNodeSqliteDatabase(location)
  if (nodeSqliteDatabase) {
    return nodeSqliteDatabase
  }

  throw new Error('No supported SQLite backend is available for the QGIS catalog store.')
}

function tryCreateBetterSqliteDatabase(location: string): QgisSqliteDatabase | null {
  try {
    const betterSqlite3 = loadModule('better-sqlite3') as
      | (new (path: string) => QgisSqliteDatabase)
      | {
          default?: new (path: string) => QgisSqliteDatabase
        }
    const DatabaseCtor =
      typeof betterSqlite3 === 'function' ? betterSqlite3 : betterSqlite3.default || null
    return DatabaseCtor ? new DatabaseCtor(location) : null
  } catch {
    return null
  }
}

function tryCreateNodeSqliteDatabase(location: string): QgisSqliteDatabase | null {
  try {
    const sqliteModule = loadModule('node:sqlite') as {
      DatabaseSync?: new (path: string) => QgisSqliteDatabase
    }
    return sqliteModule.DatabaseSync ? new sqliteModule.DatabaseSync(location) : null
  } catch {
    return null
  }
}
