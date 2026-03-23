import fs from 'fs'
import http from 'http'
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

  it('prefers workspace skill over global copies with same id', () => {
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

  it('omits disabled skills from prompt sections', () => {
    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-skill-disabled-'))
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
      path.join(workspaceRoot, 'skills'),
      'map-qc',
      `---
id: map-qc
name: Map QC
description: Validate map layer readiness
---

# Map QC
`
    )

    const service = new SkillPackService({
      getUserDataPath: () => userDataRoot,
      getResourcesPath: () => resourcesRoot,
      getAppPath: () => appRoot,
      getCwd: () => workspaceRoot
    })

    const sections = service.buildPromptSections({
      workspaceRoot,
      recentUserMessages: ['Please run $map-qc'],
      disabledSkillIds: ['map-qc']
    })

    expect(sections.compactIndexSection).not.toContain('`$map-qc`')
    expect(sections.selectedSkillIds).toEqual([])
    expect(sections.selectedInstructionSection).toBe('')
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

  it('uploads managed skills and marks replacements', () => {
    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-managed-skill-upload-'))
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

    const firstUpload = service.uploadManagedSkill({
      fileName: 'hazard-assessment.md',
      content: `---
id: hazard-assessment
name: Hazard Assessment
description: Evaluate map hazards before release.
---

# Hazard Assessment
`
    })

    expect(firstUpload.id).toBe('hazard-assessment')
    expect(firstUpload.overwritten).toBe(false)
    expect(fs.existsSync(firstUpload.sourcePath)).toBe(true)

    const secondUpload = service.uploadManagedSkill({
      fileName: 'hazard-assessment.md',
      content: `---
id: hazard-assessment
name: Hazard Assessment
description: Updated hazard checklist.
---

# Hazard Assessment
`
    })

    expect(secondUpload.id).toBe('hazard-assessment')
    expect(secondUpload.overwritten).toBe(true)

    const listedSkills = service.listAvailableSkills({ workspaceRoot })
    const uploadedSkill = listedSkills.find((skill) => skill.id === 'hazard-assessment')
    expect(uploadedSkill).toBeDefined()
    expect(uploadedSkill?.source).toBe('managed')
  })

  it('reads and updates managed skills while keeping their id stable', () => {
    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-managed-skill-edit-'))
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

    service.uploadManagedSkill({
      fileName: 'hazard-assessment.md',
      content: `---
id: hazard-assessment
name: Hazard Assessment
description: Initial checklist.
---

# Hazard Assessment
`
    })

    const before = service.getManagedSkillContent('hazard-assessment')
    expect(before.content).toContain('Initial checklist.')

    const updated = service.updateManagedSkill({
      id: 'hazard-assessment',
      content: `---
id: hazard-assessment
name: Hazard Assessment
description: Updated checklist.
---

# Hazard Assessment
`
    })

    expect(updated.id).toBe('hazard-assessment')
    expect(updated.description).toBe('Updated checklist.')

    const after = service.getManagedSkillContent('hazard-assessment')
    expect(after.content).toContain('Updated checklist.')

    expect(() =>
      service.updateManagedSkill({
        id: 'hazard-assessment',
        content: `---
id: renamed-skill
name: Hazard Assessment
description: Should fail.
---

# Hazard Assessment
`
      })
    ).toThrow('Managed skill id cannot be changed')
  })

  it('deletes managed skills', () => {
    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-managed-skill-delete-'))
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

    service.uploadManagedSkill({
      fileName: 'hazard-assessment.md',
      content: `---
id: hazard-assessment
name: Hazard Assessment
description: Checklist.
---

# Hazard Assessment
`
    })

    expect(service.deleteManagedSkill('hazard-assessment')).toBe(true)
    expect(service.deleteManagedSkill('hazard-assessment')).toBe(false)

    const listedSkills = service.listAvailableSkills({ workspaceRoot })
    const deletedSkill = listedSkills.find((skill) => skill.id === 'hazard-assessment')
    expect(deletedSkill).toBeUndefined()
  })

  it('lists bundled skills from the local resources manifest when present', async () => {
    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-bundled-skill-local-manifest-'))
    tempRoots.push(testRoot)

    const workspaceRoot = path.join(testRoot, 'workspace')
    const userDataRoot = path.join(testRoot, 'user-data')
    const resourcesRoot = path.join(testRoot, 'resources')
    const appRoot = path.join(testRoot, 'app')

    fs.mkdirSync(workspaceRoot, { recursive: true })
    fs.mkdirSync(userDataRoot, { recursive: true })
    fs.mkdirSync(resourcesRoot, { recursive: true })
    fs.mkdirSync(appRoot, { recursive: true })

    const bundledSkillsRoot = path.join(resourcesRoot, 'skills', 'bundled')
    fs.mkdirSync(bundledSkillsRoot, { recursive: true })
    fs.writeFileSync(
      path.join(bundledSkillsRoot, 'index.json'),
      JSON.stringify({
        skills: [
          {
            id: 'geospatial-triage',
            name: 'Geospatial Triage',
            description: 'Local bundled version',
            repositoryPath: 'resources/skills/bundled/geospatial-triage/SKILL.md',
            downloadUrl:
              'https://raw.githubusercontent.com/ShahabEJ/Arion/main/resources/skills/bundled/geospatial-triage/SKILL.md'
          }
        ]
      }),
      'utf8'
    )

    const service = new SkillPackService({
      getUserDataPath: () => userDataRoot,
      getResourcesPath: () => resourcesRoot,
      getAppPath: () => appRoot,
      getCwd: () => workspaceRoot,
      getBundledSkillsManifestUrl: () => {
        throw new Error('Remote manifest should not be used when a local bundled manifest exists')
      }
    })

    const catalog = await service.listBundledSkillCatalog()
    expect(catalog).toEqual([
      {
        id: 'geospatial-triage',
        name: 'Geospatial Triage',
        description: 'Local bundled version',
        repositoryPath: 'resources/skills/bundled/geospatial-triage/SKILL.md',
        isInstalled: false
      }
    ])
  })

  it('lists bundled skills from remote manifest and installs them into managed source', async () => {
    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-bundled-skill-install-'))
    tempRoots.push(testRoot)

    const workspaceRoot = path.join(testRoot, 'workspace')
    const userDataRoot = path.join(testRoot, 'user-data')
    const resourcesRoot = path.join(testRoot, 'resources')
    const appRoot = path.join(testRoot, 'app')

    fs.mkdirSync(workspaceRoot, { recursive: true })
    fs.mkdirSync(userDataRoot, { recursive: true })
    fs.mkdirSync(resourcesRoot, { recursive: true })
    fs.mkdirSync(appRoot, { recursive: true })

    const skillContent = `---
id: geospatial-triage
name: Geospatial Triage
description: Bundled version
---

# Bundled Version
`

    let manifestPayload = ''

    const server = await new Promise<http.Server>((resolve, reject) => {
      const nextServer = http
        .createServer((request, response) => {
          const requestUrl = request.url || ''

          if (requestUrl === '/resources/skills/bundled/index.json') {
            response.statusCode = 200
            response.setHeader('Content-Type', 'application/json')
            response.end(manifestPayload)
            return
          }

          if (requestUrl === '/resources/skills/bundled/geospatial-triage/SKILL.md') {
            response.statusCode = 200
            response.setHeader('Content-Type', 'text/markdown')
            response.end(skillContent)
            return
          }

          response.statusCode = 404
          response.end('Not found')
        })
        .listen(0, '127.0.0.1', () => resolve(nextServer))
      nextServer.once('error', reject)
    })

    const serverAddress = server.address()
    if (!serverAddress || typeof serverAddress === 'string') {
      server.close()
      throw new Error('Server failed to bind')
    }

    const manifestUrl = `http://127.0.0.1:${serverAddress.port}/resources/skills/bundled/index.json`
    manifestPayload = JSON.stringify({
      skills: [
        {
          id: 'geospatial-triage',
          name: 'Geospatial Triage',
          description: 'Bundled version',
          repositoryPath: 'resources/skills/bundled/geospatial-triage/SKILL.md',
          downloadUrl: `http://127.0.0.1:${serverAddress.port}/resources/skills/bundled/geospatial-triage/SKILL.md`
        }
      ]
    })

    const service = new SkillPackService({
      getUserDataPath: () => userDataRoot,
      getResourcesPath: () => resourcesRoot,
      getAppPath: () => appRoot,
      getCwd: () => workspaceRoot,
      getBundledSkillsManifestUrl: () => manifestUrl
    })

    try {
      const beforeInstallCatalog = await service.listBundledSkillCatalog()
      expect(beforeInstallCatalog).toEqual([
        {
          id: 'geospatial-triage',
          name: 'Geospatial Triage',
          description: 'Bundled version',
          repositoryPath: 'resources/skills/bundled/geospatial-triage/SKILL.md',
          isInstalled: false
        }
      ])

      const installResult = await service.installBundledSkill('geospatial-triage')
      expect(installResult.id).toBe('geospatial-triage')
      expect(installResult.overwritten).toBe(false)

      const listedSkills = service.listAvailableSkills({ workspaceRoot })
      const installedSkill = listedSkills.find(
        (skill) => skill.id === 'geospatial-triage' && skill.source === 'managed'
      )
      expect(installedSkill).toBeDefined()

      const afterInstallCatalog = await service.listBundledSkillCatalog()
      expect(afterInstallCatalog[0]?.isInstalled).toBe(true)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }
  })

  it('rejects uploads with unsafe skill identifiers', () => {
    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-managed-skill-invalid-'))
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

    expect(() =>
      service.uploadManagedSkill({
        fileName: 'SKILL.md',
        content: `---
id: ..
name: Broken
description: This should fail.
---

# Broken
`
      })
    ).toThrow('Invalid skill identifier')
  })
})
