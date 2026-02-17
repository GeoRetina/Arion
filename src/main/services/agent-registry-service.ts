import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { dbService } from './db-service'
import { PromptModuleService } from './prompt-module-service'
import * as better_sqlite3 from 'better-sqlite3'
import type {
  AgentDefinition,
  AgentCapability,
  AgentPromptConfig,
  AgentType,
  AgentRegistryEntry,
  CreateAgentParams,
  UpdateAgentParams
} from '../../shared/types/agent-types'

/**
 * Service for managing agent definitions and lifecycle
 */
export class AgentRegistryService {
  private promptModuleService: PromptModuleService
  private initialized = false

  // Helper to get the database
  private getDb(): better_sqlite3.Database {
    // Access the db object directly using type assertion
    // This is necessary because the db property is private in DBService
    return (dbService as UnsafeAny).db
  }

  // In-memory cache of agent definitions
  private agentCache: Map<string, AgentDefinition> = new Map()

  constructor(promptModuleService: PromptModuleService) {
    this.promptModuleService = promptModuleService
  }

  /**
   * Initialize the service and database schema
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    // Ensure the prompt module service is initialized
    await this.promptModuleService.initialize()

    // Run migrations for agent tables
    await this.runMigrations()

    // Load agents into cache
    await this.refreshCache()

    this.initialized = true
  }

  /**
   * Run migrations to set up agent tables
   */
  private async runMigrations(): Promise<void> {
    {
      // Load migration SQL
      // Get the app path (works in development and production)
      const appPath = app.getAppPath()

      const db = this.getDb()

      const loadMigrationSql = (migrationFileName: string): string => {
        const possiblePaths = [
          path.join(appPath, 'out/main/database/migrations', migrationFileName),
          path.join(appPath, 'src/main/database/migrations', migrationFileName)
        ]

        for (const migrationPath of possiblePaths) {
          if (fs.existsSync(migrationPath)) {
            return fs.readFileSync(migrationPath, 'utf8')
          }
        }

        throw new Error(`Migration file not found: ${migrationFileName}`)
      }

      // Ensure base agent tables exist
      db.exec(loadMigrationSql('add-agent-tables.sql'))

      // Add the agent role column if it is missing (existing user databases)
      const agentColumns = db.prepare("PRAGMA table_info('agents')").all() as { name: string }[]
      const roleColumnExists = agentColumns.some((col) => col.name === 'role')

      if (!roleColumnExists) {
        db.exec(loadMigrationSql('add-agent-role-field.sql'))
      } else {
        // Make sure the supporting index exists even if the column was added elsewhere
        db.exec('CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(role)')
      }
    }
  }

  /**
   * Refresh the in-memory cache from database
   */
  private async refreshCache(): Promise<void> {
    {
      const db = this.getDb()

      // Get all agents
      const agents = db.prepare('SELECT * FROM agents').all() as UnsafeAny[]

      // Clear existing cache
      this.agentCache.clear()

      // Process each agent
      for (const agentRow of agents) {
        const agentId = agentRow.id

        // Get agent capabilities
        const capabilities = db
          .prepare('SELECT * FROM agent_capabilities WHERE agent_id = ?')
          .all(agentId) as UnsafeAny[]

        // Get agent prompt config
        const promptConfigRow = db
          .prepare('SELECT * FROM agent_prompt_configs WHERE agent_id = ?')
          .get(agentId) as UnsafeAny

        if (!promptConfigRow) {
          continue
        }

        // Parse JSON fields
        const modelConfig = JSON.parse(agentRow.model_config)
        const toolAccess = agentRow.tool_access ? JSON.parse(agentRow.tool_access) : []
        const memoryConfig = agentRow.memory_config ? JSON.parse(agentRow.memory_config) : undefined
        const relationships = agentRow.relationships
          ? JSON.parse(agentRow.relationships)
          : undefined

        const parsedCapabilities: AgentCapability[] = capabilities.map((cap: UnsafeAny) => ({
          id: cap.id,
          name: cap.name,
          description: cap.description || '',
          tools: JSON.parse(cap.tools),
          exampleTasks: cap.example_tasks ? JSON.parse(cap.example_tasks) : undefined
        }))

        const promptConfig: AgentPromptConfig = {
          coreModules: JSON.parse(promptConfigRow.core_modules),
          taskModules: promptConfigRow.task_modules
            ? JSON.parse(promptConfigRow.task_modules)
            : undefined,
          agentModules: JSON.parse(promptConfigRow.agent_modules),
          ruleModules: promptConfigRow.rule_modules
            ? JSON.parse(promptConfigRow.rule_modules)
            : undefined
        }

        // Construct complete agent definition
        const agent: AgentDefinition = {
          id: agentId,
          name: agentRow.name,
          description: agentRow.description || '',
          type: agentRow.type as AgentType,
          role: agentRow.role || 'specialist', // Default to specialist if not specified
          icon: agentRow.icon,
          capabilities: parsedCapabilities,
          promptConfig,
          modelConfig,
          toolAccess,
          memoryConfig,
          relationships,
          createdAt: agentRow.created_at,
          updatedAt: agentRow.updated_at,
          createdBy: agentRow.created_by
        }

        // Add to cache
        this.agentCache.set(agentId, agent)
      }
    }
  }

  /**
   * Get all agents as lightweight registry entries
   */
  public async getAllAgents(): Promise<AgentRegistryEntry[]> {
    await this.ensureInitialized()

    return Array.from(this.agentCache.values()).map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      type: agent.type,
      icon: agent.icon,
      capabilities: agent.capabilities.map((cap) => cap.id),
      provider: agent.modelConfig.provider,
      model: agent.modelConfig.model,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt
    }))
  }

  /**
   * Get an agent by ID
   */
  public async getAgentById(id: string): Promise<AgentDefinition | null> {
    await this.ensureInitialized()
    return this.agentCache.get(id) || null
  }

  /**
   * Create a new agent
   */
  public async createAgent(params: CreateAgentParams): Promise<AgentDefinition> {
    await this.ensureInitialized()

    const agentId = uuidv4()
    const now = new Date().toISOString()

    // Validate prompt modules exist
    await this.validatePromptModules([
      ...params.promptConfig.coreModules,
      ...(params.promptConfig.taskModules || []),
      ...params.promptConfig.agentModules,
      ...(params.promptConfig.ruleModules || [])
    ])

    const newAgent: AgentDefinition = {
      ...params,
      id: agentId,
      createdAt: now,
      updatedAt: now
    }

    {
      const db = this.getDb()

      // Start a transaction
      db.exec('BEGIN TRANSACTION')

      try {
        // Insert agent record
        db.prepare(
          `
          INSERT INTO agents
          (id, name, description, type, role, icon, model_config, tool_access, memory_config, relationships, created_at, updated_at, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          agentId,
          newAgent.name,
          newAgent.description,
          newAgent.type,
          newAgent.role || 'specialist', // Default to specialist if not specified
          newAgent.icon,
          JSON.stringify(newAgent.modelConfig),
          JSON.stringify(newAgent.toolAccess),
          newAgent.memoryConfig ? JSON.stringify(newAgent.memoryConfig) : null,
          newAgent.relationships ? JSON.stringify(newAgent.relationships) : null,
          now,
          now,
          newAgent.createdBy
        )

        // Insert capabilities
        for (const capability of newAgent.capabilities) {
          const capabilityId = capability.id || uuidv4()

          db.prepare(
            `
            INSERT INTO agent_capabilities
            (id, agent_id, name, description, tools, example_tasks)
            VALUES (?, ?, ?, ?, ?, ?)
          `
          ).run(
            capabilityId,
            agentId,
            capability.name,
            capability.description,
            JSON.stringify(capability.tools),
            capability.exampleTasks ? JSON.stringify(capability.exampleTasks) : null
          )
        }

        // Insert prompt config
        const promptConfigId = uuidv4()
        db.prepare(
          `
          INSERT INTO agent_prompt_configs
          (id, agent_id, core_modules, task_modules, agent_modules, rule_modules, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          promptConfigId,
          agentId,
          JSON.stringify(newAgent.promptConfig.coreModules),
          newAgent.promptConfig.taskModules
            ? JSON.stringify(newAgent.promptConfig.taskModules)
            : null,
          JSON.stringify(newAgent.promptConfig.agentModules),
          newAgent.promptConfig.ruleModules
            ? JSON.stringify(newAgent.promptConfig.ruleModules)
            : null,
          now,
          now
        )

        // Commit transaction
        db.exec('COMMIT')

        // Add to cache
        this.agentCache.set(agentId, newAgent)

        return newAgent
      } catch (innerError) {
        // Rollback transaction on error
        db.exec('ROLLBACK')
        throw innerError
      }
    }
  }

  /**
   * Update an existing agent
   */
  public async updateAgent(id: string, updates: UpdateAgentParams): Promise<AgentDefinition> {
    await this.ensureInitialized()

    // Check if agent exists
    const existingAgent = this.agentCache.get(id)
    if (!existingAgent) {
      throw new Error(`Agent with ID ${id} not found`)
    }

    // Create updated agent
    const now = new Date().toISOString()

    const updatedAgent: AgentDefinition = {
      ...existingAgent,
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: now
    }

    // Validate prompt modules if prompt config is updated
    if (updates.promptConfig) {
      const modulesToCheck = [
        ...updatedAgent.promptConfig.coreModules,
        ...(updatedAgent.promptConfig.taskModules || []),
        ...updatedAgent.promptConfig.agentModules,
        ...(updatedAgent.promptConfig.ruleModules || [])
      ]
      await this.validatePromptModules(modulesToCheck)
    }

    {
      const db = this.getDb()

      // Start a transaction
      db.exec('BEGIN TRANSACTION')

      try {
        // Update agent record
        const agentUpdates: UnsafeAny[] = []
        const agentUpdateFields: string[] = []

        if (updates.name !== undefined) {
          agentUpdateFields.push('name = ?')
          agentUpdates.push(updates.name)
        }

        if (updates.description !== undefined) {
          agentUpdateFields.push('description = ?')
          agentUpdates.push(updates.description)
        }

        if (updates.type !== undefined) {
          agentUpdateFields.push('type = ?')
          agentUpdates.push(updates.type)
        }

        if (updates.role !== undefined) {
          agentUpdateFields.push('role = ?')
          agentUpdates.push(updates.role)
        }

        if (updates.icon !== undefined) {
          agentUpdateFields.push('icon = ?')
          agentUpdates.push(updates.icon)
        }

        if (updates.modelConfig !== undefined) {
          agentUpdateFields.push('model_config = ?')
          agentUpdates.push(JSON.stringify(updatedAgent.modelConfig))
        }

        if (updates.toolAccess !== undefined) {
          agentUpdateFields.push('tool_access = ?')
          agentUpdates.push(JSON.stringify(updatedAgent.toolAccess))
        }

        if (updates.memoryConfig !== undefined) {
          agentUpdateFields.push('memory_config = ?')
          agentUpdates.push(
            updatedAgent.memoryConfig ? JSON.stringify(updatedAgent.memoryConfig) : null
          )
        }

        if (updates.relationships !== undefined) {
          agentUpdateFields.push('relationships = ?')
          agentUpdates.push(
            updatedAgent.relationships ? JSON.stringify(updatedAgent.relationships) : null
          )
        }

        // Always update updated_at
        agentUpdateFields.push('updated_at = ?')
        agentUpdates.push(now)

        // Execute agent update if there are any fields to update
        if (agentUpdateFields.length > 0) {
          const agentUpdateSQL = `UPDATE agents SET ${agentUpdateFields.join(', ')} WHERE id = ?`
          db.prepare(agentUpdateSQL).run(...agentUpdates, id)
        }

        // Handle capability updates if provided
        if (updates.capabilities !== undefined) {
          // Delete existing capabilities
          db.prepare('DELETE FROM agent_capabilities WHERE agent_id = ?').run(id)

          // Insert new capabilities
          for (const capability of updatedAgent.capabilities) {
            const capabilityId = capability.id || uuidv4()

            db.prepare(
              `
              INSERT INTO agent_capabilities
              (id, agent_id, name, description, tools, example_tasks)
              VALUES (?, ?, ?, ?, ?, ?)
            `
            ).run(
              capabilityId,
              id,
              capability.name,
              capability.description,
              JSON.stringify(capability.tools),
              capability.exampleTasks ? JSON.stringify(capability.exampleTasks) : null
            )
          }
        }

        // Handle prompt config updates if provided
        if (updates.promptConfig !== undefined) {
          db.prepare(
            `
            UPDATE agent_prompt_configs
            SET core_modules = ?,
                task_modules = ?,
                agent_modules = ?,
                rule_modules = ?,
                updated_at = ?
            WHERE agent_id = ?
          `
          ).run(
            JSON.stringify(updatedAgent.promptConfig.coreModules),
            updatedAgent.promptConfig.taskModules
              ? JSON.stringify(updatedAgent.promptConfig.taskModules)
              : null,
            JSON.stringify(updatedAgent.promptConfig.agentModules),
            updatedAgent.promptConfig.ruleModules
              ? JSON.stringify(updatedAgent.promptConfig.ruleModules)
              : null,
            now,
            id
          )
        }

        // Commit transaction
        db.exec('COMMIT')

        // Update cache
        this.agentCache.set(id, updatedAgent)

        return updatedAgent
      } catch (innerError) {
        // Rollback transaction on error
        db.exec('ROLLBACK')
        throw innerError
      }
    }
  }

  /**
   * Delete an agent
   */
  public async deleteAgent(id: string): Promise<boolean> {
    await this.ensureInitialized()

    {
      const db = this.getDb()

      // Start a transaction
      db.exec('BEGIN TRANSACTION')

      try {
        // Deleting the agent will cascade delete capabilities and prompt configs
        const result = db.prepare('DELETE FROM agents WHERE id = ?').run(id)

        const success = result.changes > 0

        // Commit transaction
        db.exec('COMMIT')

        if (success) {
          // Remove from cache
          this.agentCache.delete(id)
        } else {
          void 0
        }

        return success
      } catch (innerError) {
        // Rollback transaction on error
        db.exec('ROLLBACK')
        throw innerError
      }
    }
  }

  /**
   * Record an agent execution start
   */
  public async startAgentExecution(agentId: string, chatId: string): Promise<string> {
    await this.ensureInitialized()

    // Check if agent exists
    if (!this.agentCache.has(agentId)) {
      throw new Error(`Agent with ID ${agentId} not found`)
    }

    {
      const executionId = uuidv4()
      const sessionId = uuidv4() // Generate a unique session ID for this execution
      const now = new Date().toISOString()

      const db = this.getDb()

      db.prepare(
        `
        INSERT INTO agent_executions
        (id, agent_id, chat_id, session_id, state, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        executionId,
        agentId,
        chatId,
        sessionId,
        'running', // Set initial state to running
        now
      )

      return executionId
    }
  }

  /**
   * Complete an agent execution
   */
  public async completeAgentExecution(executionId: string, error?: string): Promise<void> {
    await this.ensureInitialized()

    {
      const now = new Date().toISOString()
      const state = error ? 'error' : 'completed'

      const db = this.getDb()

      db.prepare(
        `
        UPDATE agent_executions
        SET state = ?, completed_at = ?, error = ?
        WHERE id = ?
      `
      ).run(state, now, error || null, executionId)
    }
  }

  /**
   * Validate that all prompt modules exist
   */
  private async validatePromptModules(moduleRefs: { moduleId: string }[]): Promise<void> {
    for (const { moduleId } of moduleRefs) {
      const module = await this.promptModuleService.getModuleById(moduleId)
      if (!module) {
        throw new Error(`Prompt module not found: ${moduleId}`)
      }
    }
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
