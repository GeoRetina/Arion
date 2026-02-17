import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { SkillPackService, WORKSPACE_TEMPLATE_FILES } from './skill-pack-service'

function writeSkill(rootDir: string, folderName: string, content: string): string {
  const skillDir = path.join(rootDir, folderName)
  fs.mkdirSync(skillDir, { recursive: true })
  const skillPath = path.join(skillDir, 'SKILL.md')
  fs.writeFileSync(skillPath, content, 'utf8')
  return skillPath
}

describe('SkillPackService', () => {
  const tempRoots: string[] = []

  afterEach(() => {
    for (const tempRoot of tempRoots) {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
    tempRoots.length = 0
  })

  it('prefers workspace skill over global and bundled copies with same id', () => {
    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-skill-precedence-'))
    tempRoots.push(testRoot)

    const workspaceRoot = path.join(testRoot, 'workspace')
    const userDataRoot = path.join(testRoot, 'user-data')
    const resourcesRoot = path.join(testRoot, 'resources')
    const appRoot = path.join(testRoot, 'app')

    fs.mkdirSync(workspaceRoot, { recursive: true })
    fs.mkdirSync(userDataRoot, { recursive: true })
    fs.mkdirSync(resourcesRoot, { recursive: true })
    fs.mkdirSync(appRoot, { recursive: true })

    writeSkill(
      path.join(resourcesRoot, 'skills', 'bundled'),
      'geospatial-triage',
      `---
id: geospatial-triage
name: Geospatial Triage
description: Bundled version
---

# Bundled Version`
    )
    writeSkill(
      path.join(userDataRoot, 'skills'),
      'geospatial-triage',
      `---
id: geospatial-triage
name: Geospatial Triage
description: Global version
---

# Global Version`
    )
    writeSkill(
      path.join(workspaceRoot, 'skills'),
      'geospatial-triage',
      `---
id: geospatial-triage
name: Geospatial Triage
description: Workspace version
---

# Workspace Version`
    )

    const service = new SkillPackService({
      getUserDataPath: () => userDataRoot,
      getResourcesPath: () => resourcesRoot,
      getAppPath: () => appRoot,
      getCwd: () => workspaceRoot
    })

    const sections = service.buildPromptSections({
      workspaceRoot,
      recentUserMessages: ['Please run $geospatial-triage before planning']
    })

    expect(sections.selectedSkillIds).toEqual(['geospatial-triage'])
    expect(sections.selectedInstructionSection).toContain('# Workspace Version')
    expect(sections.selectedInstructionSection).not.toContain('# Global Version')
    expect(sections.selectedInstructionSection).not.toContain('# Bundled Version')
    expect(sections.compactIndexSection).toContain('`$geospatial-triage` (workspace)')
  })

  it('loads skills on demand and limits selected skills to the configured cap', () => {
    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-skill-selection-'))
    tempRoots.push(testRoot)

    const workspaceRoot = path.join(testRoot, 'workspace')
    const userDataRoot = path.join(testRoot, 'user-data')
    const resourcesRoot = path.join(testRoot, 'resources')
    const appRoot = path.join(testRoot, 'app')

    fs.mkdirSync(workspaceRoot, { recursive: true })
    fs.mkdirSync(userDataRoot, { recursive: true })
    fs.mkdirSync(resourcesRoot, { recursive: true })
    fs.mkdirSync(appRoot, { recursive: true })

    const workspaceSkillsRoot = path.join(workspaceRoot, 'skills')
    writeSkill(
      workspaceSkillsRoot,
      'map-qc',
      `---
id: map-qc
name: Map QC
description: Validate map layer readiness
---

# Map QC`
    )
    writeSkill(
      workspaceSkillsRoot,
      'risk-audit',
      `---
id: risk-audit
name: Risk Audit
description: Run risk checks before execution
---

# Risk Audit`
    )
    writeSkill(
      workspaceSkillsRoot,
      'raster-comparison',
      `---
id: raster-comparison
name: Raster Comparison
description: Compare raster outputs over time
---

# Raster Comparison`
    )
    writeSkill(
      workspaceSkillsRoot,
      'coverage-check',
      `---
id: coverage-check
name: Coverage Check
description: Verify polygon coverage quality
---

# Coverage Check`
    )

    const service = new SkillPackService({
      getUserDataPath: () => userDataRoot,
      getResourcesPath: () => resourcesRoot,
      getAppPath: () => appRoot,
      getCwd: () => workspaceRoot
    })

    const sections = service.buildPromptSections({
      workspaceRoot,
      explicitSkillIds: ['map-qc', 'raster-comparison', 'coverage-check', 'risk-audit'],
      recentUserMessages: ['Also run risk audit if possible']
    })

    expect(sections.selectedSkillIds).toEqual(['map-qc', 'raster-comparison', 'coverage-check'])
    expect(sections.selectedInstructionSection).toContain('`$map-qc`')
    expect(sections.selectedInstructionSection).toContain('`$raster-comparison`')
    expect(sections.selectedInstructionSection).toContain('`$coverage-check`')
    expect(sections.selectedInstructionSection).not.toContain('`$risk-audit`')
  })

  it('bootstraps workspace templates and keeps existing files untouched', () => {
    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-skill-templates-'))
    tempRoots.push(testRoot)

    const workspaceRoot = path.join(testRoot, 'workspace')
    const userDataRoot = path.join(testRoot, 'user-data')
    const resourcesRoot = path.join(testRoot, 'resources')
    const appRoot = path.join(testRoot, 'app')

    fs.mkdirSync(workspaceRoot, { recursive: true })
    fs.mkdirSync(userDataRoot, { recursive: true })
    fs.mkdirSync(resourcesRoot, { recursive: true })
    fs.mkdirSync(appRoot, { recursive: true })

    const service = new SkillPackService({
      getUserDataPath: () => userDataRoot,
      getResourcesPath: () => resourcesRoot,
      getAppPath: () => appRoot,
      getCwd: () => workspaceRoot
    })

    const firstRun = service.bootstrapWorkspaceTemplateFiles(workspaceRoot)
    expect(firstRun.created).toEqual(WORKSPACE_TEMPLATE_FILES)
    expect(firstRun.existing).toEqual([])

    for (const fileName of WORKSPACE_TEMPLATE_FILES) {
      const fullPath = path.join(workspaceRoot, fileName)
      expect(fs.existsSync(fullPath)).toBe(true)
      expect(fs.readFileSync(fullPath, 'utf8').trim().length).toBeGreaterThan(0)
    }

    const secondRun = service.bootstrapWorkspaceTemplateFiles(workspaceRoot)
    expect(secondRun.created).toEqual([])
    expect(secondRun.existing).toEqual(WORKSPACE_TEMPLATE_FILES)
  })
})
