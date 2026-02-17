import fs from 'fs'
import path from 'path'

export type SkillSource = 'workspace' | 'global' | 'managed' | 'bundled'

export interface SkillPackEnvironment {
  getUserDataPath: () => string
  getAppPath: () => string
  getResourcesPath: () => string
  getCwd: () => string
}

export interface ResolvedSkill {
  id: string
  name: string
  description: string
  source: SkillSource
  sourcePath: string
  content: string
}

export interface SkillPromptBuildOptions {
  workspaceRoot?: string
  recentUserMessages?: string[]
  explicitSkillIds?: string[]
}

export interface SkillPromptSections {
  compactIndexSection: string
  selectedInstructionSection: string
  selectedSkillIds: string[]
}

export const WORKSPACE_TEMPLATE_FILES = [
  'AGENTS.md',
  'SOUL.md',
  'TOOLS.md',
  'IDENTITY.md',
  'USER.md'
] as const

type WorkspaceTemplateFile = (typeof WORKSPACE_TEMPLATE_FILES)[number]

export interface WorkspaceTemplateBootstrapResult {
  workspaceRoot: string
  created: string[]
  existing: string[]
}

interface SkillLookupOptions {
  workspaceRoot?: string
}

interface SkillSearchRoot {
  source: SkillSource
  dir: string
  precedence: number
  order: number
}

interface SkillCandidate extends ResolvedSkill {
  precedence: number
  rootOrder: number
}

interface ParsedFrontmatter {
  metadata: Record<string, string>
  body: string
}

const MAX_SELECTED_SKILLS = 3
const MAX_SELECTED_INSTRUCTION_CHARS = 24000
const INDEX_DESCRIPTION_LIMIT = 140

const DEFAULT_TEMPLATE_CONTENT: Record<WorkspaceTemplateFile, string> = {
  'AGENTS.md': `# Agents

## Operating Model
- Keep analysis geospatial-first and grounded in source data.
- Prefer explicit plans for multi-step workflows.
- Explain assumptions and uncertainty before tool execution.
`,
  'SOUL.md': `# Soul

## Product Personality
- Practical and evidence-oriented.
- Safety-aware and policy-respecting.
- Focused on repeatable outcomes over one-off hacks.
`,
  'TOOLS.md': `# Tools

## Tooling Guardrails
- Validate all tool inputs before execution.
- Use least-privilege permissions and explicit approvals for risky actions.
- Persist key tool outcomes for traceability.
`,
  'IDENTITY.md': `# Identity

## Workspace Identity
- Domain:
- Primary datasets:
- Success criteria:
- Risk boundaries:
`,
  'USER.md': `# User

## Collaboration Preferences
- Decision style:
- Communication style:
- Escalation threshold:
- Definition of done:
`
}

export class SkillPackService {
  private environment: SkillPackEnvironment

  constructor(environment?: Partial<SkillPackEnvironment>) {
    this.environment = {
      getUserDataPath:
        environment?.getUserDataPath ?? (() => path.join(process.cwd(), '.arion-user-data')),
      getAppPath: environment?.getAppPath ?? (() => process.cwd()),
      getResourcesPath: environment?.getResourcesPath ?? (() => process.resourcesPath || ''),
      getCwd: environment?.getCwd ?? (() => process.cwd())
    }
  }

  public listAvailableSkills(options: SkillLookupOptions = {}): ResolvedSkill[] {
    const workspaceRoot = this.resolveWorkspaceRoot(options.workspaceRoot)
    const searchRoots = this.getSkillSearchRoots(workspaceRoot)
    const candidates = searchRoots.flatMap((root) => this.readSkillsFromRoot(root))

    const byId = new Map<string, SkillCandidate>()
    for (const candidate of candidates) {
      const existing = byId.get(candidate.id)
      if (!existing) {
        byId.set(candidate.id, candidate)
        continue
      }

      const shouldReplace =
        candidate.precedence > existing.precedence ||
        (candidate.precedence === existing.precedence && candidate.rootOrder < existing.rootOrder)

      if (shouldReplace) {
        byId.set(candidate.id, candidate)
      }
    }

    return Array.from(byId.values())
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        source: skill.source,
        sourcePath: skill.sourcePath,
        content: skill.content
      }))
  }

  public buildPromptSections(options: SkillPromptBuildOptions = {}): SkillPromptSections {
    const skills = this.listAvailableSkills({ workspaceRoot: options.workspaceRoot })
    const selectedSkills = this.selectSkills(
      skills,
      options.recentUserMessages || [],
      options.explicitSkillIds || []
    )

    return {
      compactIndexSection: this.buildCompactIndexSection(skills),
      selectedInstructionSection: this.buildSelectedInstructionSection(selectedSkills),
      selectedSkillIds: selectedSkills.map((skill) => skill.id)
    }
  }

  public bootstrapWorkspaceTemplateFiles(
    workspaceRootInput: string
  ): WorkspaceTemplateBootstrapResult {
    const workspaceRoot = path.resolve(workspaceRootInput || this.environment.getCwd())
    fs.mkdirSync(workspaceRoot, { recursive: true })

    const created: string[] = []
    const existing: string[] = []

    for (const fileName of WORKSPACE_TEMPLATE_FILES) {
      const outputPath = path.join(workspaceRoot, fileName)
      if (fs.existsSync(outputPath)) {
        existing.push(fileName)
        continue
      }

      const templateContent = this.getWorkspaceTemplateContent(fileName)
      fs.writeFileSync(outputPath, templateContent, 'utf8')
      created.push(fileName)
    }

    return {
      workspaceRoot,
      created,
      existing
    }
  }

  private getWorkspaceTemplateContent(fileName: WorkspaceTemplateFile): string {
    const candidatePaths = this.deduplicatePaths([
      path.join(this.environment.getResourcesPath(), 'workspace-templates', fileName),
      path.join(this.environment.getAppPath(), 'resources', 'workspace-templates', fileName),
      path.join(this.environment.getCwd(), 'resources', 'workspace-templates', fileName)
    ])

    for (const candidatePath of candidatePaths) {
      if (!candidatePath || !fs.existsSync(candidatePath)) {
        continue
      }

      try {
        return fs.readFileSync(candidatePath, 'utf8')
      } catch {
        continue
      }
    }

    return DEFAULT_TEMPLATE_CONTENT[fileName]
  }

  private resolveWorkspaceRoot(workspaceRootInput?: string): string {
    if (workspaceRootInput && workspaceRootInput.trim().length > 0) {
      return path.resolve(workspaceRootInput)
    }
    return path.resolve(this.environment.getCwd())
  }

  private getSkillSearchRoots(workspaceRoot: string): SkillSearchRoot[] {
    const userDataPath = this.environment.getUserDataPath()
    const appPath = this.environment.getAppPath()
    const resourcesPath = this.environment.getResourcesPath()
    const cwd = this.environment.getCwd()

    const unorderedRoots: Omit<SkillSearchRoot, 'order'>[] = [
      { source: 'workspace', precedence: 300, dir: path.join(workspaceRoot, 'skills') },
      { source: 'workspace', precedence: 300, dir: path.join(workspaceRoot, '.arion', 'skills') },
      { source: 'managed', precedence: 200, dir: path.join(userDataPath, 'managed-skills') },
      { source: 'global', precedence: 200, dir: path.join(userDataPath, 'skills') },
      { source: 'bundled', precedence: 100, dir: path.join(resourcesPath, 'skills', 'bundled') },
      {
        source: 'bundled',
        precedence: 100,
        dir: path.join(appPath, 'resources', 'skills', 'bundled')
      },
      { source: 'bundled', precedence: 100, dir: path.join(cwd, 'resources', 'skills', 'bundled') }
    ]

    return this.deduplicatePaths(unorderedRoots.map((root) => root.dir))
      .map((dir) => unorderedRoots.find((root) => path.resolve(root.dir) === dir))
      .filter((root): root is Omit<SkillSearchRoot, 'order'> => Boolean(root))
      .map((root, order) => ({
        ...root,
        order
      }))
  }

  private readSkillsFromRoot(root: SkillSearchRoot): SkillCandidate[] {
    if (!fs.existsSync(root.dir)) {
      return []
    }

    let rootStat: fs.Stats
    try {
      rootStat = fs.statSync(root.dir)
    } catch {
      return []
    }

    if (!rootStat.isDirectory()) {
      return []
    }

    const collected: SkillCandidate[] = []

    const rootSkillFile = path.join(root.dir, 'SKILL.md')
    if (fs.existsSync(rootSkillFile)) {
      const parsedRootSkill = this.parseSkillFile(rootSkillFile, root, path.basename(root.dir))
      if (parsedRootSkill) {
        collected.push(parsedRootSkill)
      }
    }

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(root.dir, { withFileTypes: true })
    } catch {
      return collected
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      const skillFile = path.join(root.dir, entry.name, 'SKILL.md')
      if (!fs.existsSync(skillFile)) {
        continue
      }

      const parsed = this.parseSkillFile(skillFile, root, entry.name)
      if (parsed) {
        collected.push(parsed)
      }
    }

    return collected
  }

  private parseSkillFile(
    skillFilePath: string,
    root: SkillSearchRoot,
    fallbackFolderName: string
  ): SkillCandidate | null {
    let rawContent = ''
    try {
      rawContent = fs.readFileSync(skillFilePath, 'utf8')
    } catch {
      return null
    }

    const trimmedRaw = rawContent.trim()
    if (!trimmedRaw) {
      return null
    }

    const { metadata, body } = this.parseFrontmatter(trimmedRaw)
    const bodyTrimmed = body.trim()
    const normalizedId = this.normalizeSkillId(metadata.id || fallbackFolderName)
    if (!normalizedId) {
      return null
    }

    const name = metadata.name || this.getFirstHeading(bodyTrimmed) || fallbackFolderName
    const description =
      metadata.description ||
      this.getFirstMeaningfulLine(bodyTrimmed) ||
      `Skill ${normalizedId} from ${path.dirname(skillFilePath)}`

    return {
      id: normalizedId,
      name: name.trim(),
      description: description.trim(),
      source: root.source,
      sourcePath: skillFilePath,
      content: bodyTrimmed || trimmedRaw,
      precedence: root.precedence,
      rootOrder: root.order
    }
  }

  private parseFrontmatter(content: string): ParsedFrontmatter {
    if (!content.startsWith('---')) {
      return { metadata: {}, body: content }
    }

    const normalized = content.replace(/\r\n/g, '\n')
    const lines = normalized.split('\n')
    if (lines[0] !== '---') {
      return { metadata: {}, body: content }
    }

    const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
    if (closingIndex <= 0) {
      return { metadata: {}, body: content }
    }

    const metadataLines = lines.slice(1, closingIndex)
    const body = lines.slice(closingIndex + 1).join('\n')
    const metadata: Record<string, string> = {}

    for (const line of metadataLines) {
      const separatorIndex = line.indexOf(':')
      if (separatorIndex <= 0) {
        continue
      }

      const key = line.slice(0, separatorIndex).trim().toLowerCase()
      const value = line
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '')
      if (!key || !value) {
        continue
      }
      metadata[key] = value
    }

    return { metadata, body }
  }

  private getFirstHeading(content: string): string {
    const lines = content.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('#')) {
        continue
      }
      return trimmed.replace(/^#+\s*/, '').trim()
    }
    return ''
  }

  private getFirstMeaningfulLine(content: string): string {
    const lines = content.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }
      if (trimmed.startsWith('#')) {
        continue
      }
      return trimmed
    }
    return ''
  }

  private normalizeSkillId(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  private buildCompactIndexSection(skills: ResolvedSkill[]): string {
    if (skills.length === 0) {
      return ''
    }

    const lines = [
      'SKILLS INDEX (compact):',
      ...skills.map((skill) => {
        const description = this.truncate(skill.description, INDEX_DESCRIPTION_LIMIT)
        return `- \`$${skill.id}\` (${skill.source}) - ${description}`
      })
    ]

    return lines.join('\n')
  }

  private buildSelectedInstructionSection(selectedSkills: ResolvedSkill[]): string {
    if (selectedSkills.length === 0) {
      return ''
    }

    const lines = ['SELECTED SKILL INSTRUCTIONS (loaded on demand):']
    let usedChars = 0

    for (const skill of selectedSkills) {
      if (usedChars >= MAX_SELECTED_INSTRUCTION_CHARS) {
        break
      }

      const remainingChars = MAX_SELECTED_INSTRUCTION_CHARS - usedChars
      const boundedContent = this.truncate(skill.content, remainingChars)

      lines.push(
        `\n### \`$${skill.id}\` - ${skill.name}`,
        `Source: ${skill.source} (${skill.sourcePath})`,
        boundedContent
      )
      usedChars += boundedContent.length
    }

    return lines.join('\n')
  }

  private selectSkills(
    skills: ResolvedSkill[],
    recentUserMessages: string[],
    explicitSkillIds: string[]
  ): ResolvedSkill[] {
    if (skills.length === 0) {
      return []
    }

    const byId = new Map(skills.map((skill) => [skill.id, skill]))
    const selected = new Map<string, ResolvedSkill>()

    const addById = (id: string): void => {
      if (selected.size >= MAX_SELECTED_SKILLS) {
        return
      }
      const normalizedId = this.normalizeSkillId(id)
      const skill = byId.get(normalizedId)
      if (skill) {
        selected.set(skill.id, skill)
      }
    }

    for (const skillId of explicitSkillIds) {
      addById(skillId)
    }

    for (const message of recentUserMessages) {
      if (selected.size >= MAX_SELECTED_SKILLS) {
        break
      }
      const mentions = this.extractSkillMentions(message)
      for (const mention of mentions) {
        addById(mention)
      }
    }

    const normalizedMessages = recentUserMessages.map((message) => message.toLowerCase())
    for (const skill of skills) {
      if (selected.size >= MAX_SELECTED_SKILLS) {
        break
      }
      if (selected.has(skill.id)) {
        continue
      }

      const idPattern = new RegExp(`\\b${this.escapeRegExp(skill.id.toLowerCase())}\\b`, 'i')
      const namePattern = new RegExp(`\\b${this.escapeRegExp(skill.name.toLowerCase())}\\b`, 'i')
      const hasImplicitReference = normalizedMessages.some((message) => {
        return idPattern.test(message) || namePattern.test(message)
      })

      if (hasImplicitReference) {
        selected.set(skill.id, skill)
      }
    }

    return Array.from(selected.values())
  }

  private extractSkillMentions(message: string): string[] {
    const mentions: string[] = []
    const mentionRegex = /[$@]([a-zA-Z0-9._-]{2,64})/g
    let match: RegExpExecArray | null

    while ((match = mentionRegex.exec(message)) !== null) {
      const mentioned = this.normalizeSkillId(match[1] || '')
      if (!mentioned) {
        continue
      }
      mentions.push(mentioned)
    }

    return mentions
  }

  private truncate(value: string, maxLength: number): string {
    if (maxLength <= 0) {
      return ''
    }
    if (value.length <= maxLength) {
      return value
    }

    const suffix = '...'
    const safeLength = Math.max(0, maxLength - suffix.length)
    return `${value.slice(0, safeLength)}${suffix}`
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  private deduplicatePaths(paths: string[]): string[] {
    const unique = new Set<string>()
    for (const dir of paths) {
      if (!dir || !dir.trim()) {
        continue
      }
      unique.add(path.resolve(dir))
    }
    return Array.from(unique)
  }
}
