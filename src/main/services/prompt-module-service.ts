import { v4 as uuidv4 } from 'uuid'
import { dbService } from './db-service'
import * as better_sqlite3 from 'better-sqlite3'
import {
  PromptModule,
  PromptModuleType,
  PromptCondition,
  PromptAssemblyRequest,
  PromptAssemblyResult,
  CreatePromptModuleParams,
  UpdatePromptModuleParams,
  PromptModuleInfo
} from '../../shared/types/prompt-types'

/**
 * Service for managing prompt modules and assembling system prompts
 */
export class PromptModuleService {
  private initialized = false

  // Helper to get the database
  private getDb(): better_sqlite3.Database {
    // Access the db object directly using type assertion
    // This is necessary because the db property is private in DBService
    return (dbService as UnsafeAny).db
  }

  // In-memory cache of prompt modules
  private moduleCache: Map<string, PromptModule> = new Map()

  constructor() {
    void 0
  }

  /**
   * Initialize the service and database schema
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    // Create tables if they don't exist
    await this.ensureDatabaseSchema()

    // Load modules into cache
    await this.refreshCache()

    // Ensure default modules exist
    await this.ensureDefaultModules()

    this.initialized = true
  }

  /**
   * Ensure default prompt modules exist
   */
  private async ensureDefaultModules(): Promise<void> {
    // Check for user-defined-prompt module
    const userDefinedPromptExists = Array.from(this.moduleCache.values()).some(
      (module) => module.id === 'user-defined-prompt'
    )

    if (!userDefinedPromptExists) {
      await this.createModule(
        {
          name: 'User-Defined Prompt',
          description: 'Custom prompt content provided by the user for agent definition',
          type: 'agent',
          content: '{{content}}',
          parameters: ['content'],
          priority: 100,
          author: 'system'
        },
        'user-defined-prompt',
        true
      )
    }
  }

  /**
   * Ensure database schema exists for prompt modules
   */
  private async ensureDatabaseSchema(): Promise<void> {
    // This would normally be in a migration file, but for simplicity creating here
    const createTablesSQL = `
      CREATE TABLE IF NOT EXISTS prompt_modules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL CHECK (type IN ('core', 'capability', 'task', 'agent', 'rule')),
        content TEXT NOT NULL,
        parameters TEXT, -- JSON array of parameter names
        dependencies TEXT, -- JSON array of module IDs
        conditions TEXT, -- JSON array of conditions
        priority INTEGER DEFAULT 0,
        version TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        author TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_prompt_modules_type ON prompt_modules(type);
    `

    {
      const db = this.getDb()
      db.exec(createTablesSQL)
    }
  }

  /**
   * Refresh the in-memory cache from database
   */
  private async refreshCache(): Promise<void> {
    {
      const db = this.getDb()
      const modules = db.prepare('SELECT * FROM prompt_modules').all() as UnsafeAny[]

      // Clear existing cache
      this.moduleCache.clear()

      // Parse JSON fields and add to cache
      for (const moduleRow of modules) {
        const module: PromptModule = {
          id: moduleRow.id,
          name: moduleRow.name,
          description: moduleRow.description || '',
          type: moduleRow.type as PromptModuleType,
          content: moduleRow.content,
          parameters: moduleRow.parameters ? JSON.parse(moduleRow.parameters) : undefined,
          dependencies: moduleRow.dependencies ? JSON.parse(moduleRow.dependencies) : undefined,
          conditions: moduleRow.conditions ? JSON.parse(moduleRow.conditions) : undefined,
          priority: moduleRow.priority || 0,
          version: moduleRow.version,
          createdAt: moduleRow.created_at,
          updatedAt: moduleRow.updated_at,
          author: moduleRow.author
        }

        this.moduleCache.set(module.id, module)
      }
    }
  }

  /**
   * Get all prompt modules as lightweight info objects
   */
  public async getAllModules(): Promise<PromptModuleInfo[]> {
    await this.ensureInitialized()

    return Array.from(this.moduleCache.values()).map((module) => ({
      id: module.id,
      name: module.name,
      description: module.description,
      type: module.type,
      version: module.version,
      parameters: module.parameters
    }))
  }

  /**
   * Get a prompt module by ID
   */
  public async getModuleById(id: string): Promise<PromptModule | null> {
    await this.ensureInitialized()
    return this.moduleCache.get(id) || null
  }

  /**
   * Create a new prompt module
   */
  public async createModule(
    params: CreatePromptModuleParams,
    specificId?: string,
    skipInitCheck: boolean = false
  ): Promise<PromptModule> {
    // Only perform initialization check if not explicitly skipped
    if (!skipInitCheck) {
      await this.ensureInitialized()
    }

    const id = specificId || uuidv4()
    const now = new Date().toISOString()
    const version = '1.0.0'

    const newModule: PromptModule = {
      id,
      name: params.name,
      description: params.description,
      type: params.type,
      content: params.content,
      parameters: params.parameters,
      dependencies: params.dependencies,
      conditions: params.conditions,
      priority: params.priority || 0,
      version,
      createdAt: now,
      updatedAt: now,
      author: params.author
    }

    {
      // Check if module with this ID already exists in the database
      const db = this.getDb()
      const existingModule = db.prepare('SELECT id FROM prompt_modules WHERE id = ?').get(id)

      if (existingModule) {
        // Just update the cache if needed
        if (!this.moduleCache.has(id)) {
          this.moduleCache.set(newModule.id, newModule)
        }
        return newModule
      }

      // Insert the new module
      db.prepare(
        `
        INSERT INTO prompt_modules 
        (id, name, description, type, content, parameters, dependencies, conditions, priority, version, created_at, updated_at, author) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        newModule.id,
        newModule.name,
        newModule.description,
        newModule.type,
        newModule.content,
        newModule.parameters ? JSON.stringify(newModule.parameters) : null,
        newModule.dependencies ? JSON.stringify(newModule.dependencies) : null,
        newModule.conditions ? JSON.stringify(newModule.conditions) : null,
        newModule.priority,
        newModule.version,
        newModule.createdAt,
        newModule.updatedAt,
        newModule.author
      )

      // Add to cache
      this.moduleCache.set(newModule.id, newModule)

      return newModule
    }
  }

  /**
   * Update an existing prompt module
   */
  public async updateModule(id: string, updates: UpdatePromptModuleParams): Promise<PromptModule> {
    await this.ensureInitialized()

    // Check if module exists
    const existingModule = this.moduleCache.get(id)
    if (!existingModule) {
      throw new Error(`Prompt module with ID ${id} not found`)
    }

    // Create updated module
    const now = new Date().toISOString()

    // Calculate version bump (simple approach - real versioning would be more sophisticated)
    const currentVersion = existingModule.version.split('.')
    const minorVersion = parseInt(currentVersion[1] || '0') + 1
    const newVersion = `${currentVersion[0] || '1'}.${minorVersion}.0`

    const updatedModule: PromptModule = {
      ...existingModule,
      ...updates,
      version: newVersion,
      updatedAt: now
    }

    {
      // Build update SQL dynamically based on provided fields
      const db = this.getDb()
      const fields: string[] = []
      const values: UnsafeAny[] = []

      if (updates.name !== undefined) {
        fields.push('name = ?')
        values.push(updates.name)
      }

      if (updates.description !== undefined) {
        fields.push('description = ?')
        values.push(updates.description)
      }

      if (updates.type !== undefined) {
        fields.push('type = ?')
        values.push(updates.type)
      }

      if (updates.content !== undefined) {
        fields.push('content = ?')
        values.push(updates.content)
      }

      if (updates.parameters !== undefined) {
        fields.push('parameters = ?')
        values.push(JSON.stringify(updates.parameters))
      }

      if (updates.dependencies !== undefined) {
        fields.push('dependencies = ?')
        values.push(JSON.stringify(updates.dependencies))
      }

      if (updates.conditions !== undefined) {
        fields.push('conditions = ?')
        values.push(JSON.stringify(updates.conditions))
      }

      if (updates.priority !== undefined) {
        fields.push('priority = ?')
        values.push(updates.priority)
      }

      // Always update version and updated_at
      fields.push('version = ?')
      values.push(newVersion)

      fields.push('updated_at = ?')
      values.push(now)

      // Execute update
      if (fields.length > 0) {
        const updateSQL = `UPDATE prompt_modules SET ${fields.join(', ')} WHERE id = ?`
        db.prepare(updateSQL).run(...values, id)
      }

      // Update cache
      this.moduleCache.set(id, updatedModule)

      return updatedModule
    }
  }

  /**
   * Delete a prompt module
   */
  public async deleteModule(id: string): Promise<boolean> {
    await this.ensureInitialized()

    {
      const db = this.getDb()
      const result = db.prepare('DELETE FROM prompt_modules WHERE id = ?').run(id)

      const success = result.changes > 0

      if (success) {
        // Remove from cache
        this.moduleCache.delete(id)
      } else {
        void 0
      }

      return success
    }
  }

  /**
   * Assemble a system prompt from modules
   */
  public async assemblePrompt(request: PromptAssemblyRequest): Promise<PromptAssemblyResult> {
    await this.ensureInitialized()

    {
      // Collect and validate all modules
      const modulesToInclude: PromptModule[] = []
      const warnings: string[] = []
      const includedModuleIds: string[] = []

      // Helper to collect modules with validation
      const collectModules = async (
        moduleParams: { moduleId: string; parameters: Record<string, string> }[]
      ): Promise<void> => {
        for (const { moduleId, parameters } of moduleParams) {
          const module = this.moduleCache.get(moduleId)

          if (!module) {
            warnings.push(`Module not found: ${moduleId}`)
            continue
          }

          // Check dependencies
          if (module.dependencies) {
            for (const dependencyId of module.dependencies) {
              if (!this.moduleCache.has(dependencyId)) {
                warnings.push(`Dependency not found for module ${moduleId}: ${dependencyId}`)
              } else if (!includedModuleIds.includes(dependencyId)) {
                // Add missing dependency
                const dependency = this.moduleCache.get(dependencyId)!
                modulesToInclude.push(dependency)
                includedModuleIds.push(dependencyId)
                warnings.push(
                  `Automatically added dependency ${dependency.name} for module ${module.name}`
                )
              }
            }
          }

          // Check conditions (if context provided)
          if (module.conditions && request.context) {
            const shouldInclude = this.evaluateConditions(module.conditions, request.context)
            if (!shouldInclude) {
              warnings.push(`Module ${moduleId} was excluded due to conditions not being met`)
              continue
            }
          }

          // Validate parameters
          if (module.parameters) {
            for (const param of module.parameters) {
              if (!(param in parameters)) {
                warnings.push(`Missing parameter "${param}" for module ${moduleId}`)
              }
            }
          }

          modulesToInclude.push(module)
          includedModuleIds.push(moduleId)
        }
      }

      // Collect all requested modules
      await collectModules(request.coreModules)
      await collectModules(request.taskModules || [])
      await collectModules(request.agentModules)
      await collectModules(request.ruleModules || [])

      // Sort modules by type and priority
      modulesToInclude.sort((a, b) => {
        // First sort by module type order
        const typeOrder: Record<PromptModuleType, number> = {
          core: 0,
          capability: 1,
          task: 2,
          agent: 3,
          rule: 4
        }

        const typeComparison = typeOrder[a.type] - typeOrder[b.type]
        if (typeComparison !== 0) return typeComparison

        // Then by priority (higher numbers come first)
        return (b.priority || 0) - (a.priority || 0)
      })

      // Extract parameter values by module ID
      const allParams: Record<string, Record<string, string>> = {}

      const addParams = (
        moduleRefs: { moduleId: string; parameters: Record<string, string> }[]
      ): void => {
        for (const { moduleId, parameters } of moduleRefs) {
          allParams[moduleId] = parameters
        }
      }

      addParams(request.coreModules)
      addParams(request.taskModules || [])
      addParams(request.agentModules)
      addParams(request.ruleModules || [])

      // Assemble the final prompt
      let assembledPrompt = ''

      // Process each module's content with parameter substitution
      for (const module of modulesToInclude) {
        let moduleContent = module.content

        // Apply parameter substitution
        if (module.parameters && allParams[module.id]) {
          const params = allParams[module.id]
          for (const param of module.parameters) {
            if (param in params) {
              const regex = new RegExp(`\\{\\{${param}\\}\\}`, 'g')
              moduleContent = moduleContent.replace(regex, params[param])
            }
          }
        }

        // Add separator between modules
        if (assembledPrompt) {
          assembledPrompt += '\n\n'
        }

        // Add module header as comment
        assembledPrompt += `<!-- Module: ${module.name} (${module.type}) -->\n`
        assembledPrompt += moduleContent
      }

      // Estimate token count (very rough approximation)
      const tokenCount = Math.ceil(assembledPrompt.length / 4)

      // Result
      const result: PromptAssemblyResult = {
        assembledPrompt,
        includedModules: includedModuleIds,
        tokenCount,
        warnings: warnings.length > 0 ? warnings : undefined
      }

      return result
    }
  }

  /**
   * Evaluate conditions against context
   */
  private evaluateConditions(
    conditions: PromptCondition[],
    context: Record<string, unknown>
  ): boolean {
    // If no conditions, include by default
    if (!conditions || conditions.length === 0) {
      return true
    }

    // All conditions must pass (AND logic)
    return conditions.every((condition) => {
      const { field, operator, value } = condition

      // Check if field exists in context
      const fieldExists = field in context
      const fieldValue = fieldExists ? context[field] : undefined

      switch (operator) {
        case 'equals':
          return fieldValue === value
        case 'not_equals':
          return fieldValue !== value
        case 'contains':
          return typeof fieldValue === 'string'
            ? fieldValue.includes(value)
            : Array.isArray(fieldValue)
              ? fieldValue.includes(value)
              : false
        case 'not_contains':
          return typeof fieldValue === 'string'
            ? !fieldValue.includes(value)
            : Array.isArray(fieldValue)
              ? !fieldValue.includes(value)
              : true
        case 'greater_than':
          return typeof fieldValue === 'number' && typeof value === 'number'
            ? fieldValue > value
            : false
        case 'less_than':
          return typeof fieldValue === 'number' && typeof value === 'number'
            ? fieldValue < value
            : false
        case 'exists':
          return fieldExists
        case 'not_exists':
          return !fieldExists
        default:
          return false
      }
    })
  }

  /**
   * Ensure the service is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }
}
