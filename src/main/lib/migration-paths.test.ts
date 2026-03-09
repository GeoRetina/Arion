import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveMigrationPath } from './migration-paths'

describe('migration-paths', () => {
  let tempRoot: string | null = null

  afterEach(() => {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true })
      tempRoot = null
    }
  })

  it('prefers packaged out/database migrations when they exist', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-migration-paths-'))

    const packagedDir = path.join(tempRoot, 'out', 'database', 'migrations')
    const sourceDir = path.join(tempRoot, 'src', 'main', 'database', 'migrations')
    fs.mkdirSync(packagedDir, { recursive: true })
    fs.mkdirSync(sourceDir, { recursive: true })

    const migrationFile = 'add-agent-tables.sql'
    fs.writeFileSync(path.join(packagedDir, migrationFile), '-- packaged', 'utf8')
    fs.writeFileSync(path.join(sourceDir, migrationFile), '-- source', 'utf8')

    expect(resolveMigrationPath(migrationFile, { appPath: tempRoot })).toBe(
      path.join(packagedDir, migrationFile)
    )
  })

  it('falls back to source migrations when packaged files are missing', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-migration-paths-'))

    const sourceDir = path.join(tempRoot, 'src', 'main', 'database', 'migrations')
    fs.mkdirSync(sourceDir, { recursive: true })

    const migrationFile = 'add-layer-tables.sql'
    fs.writeFileSync(path.join(sourceDir, migrationFile), '-- source', 'utf8')

    expect(resolveMigrationPath(migrationFile, { appPath: tempRoot })).toBe(
      path.join(sourceDir, migrationFile)
    )
  })
})
