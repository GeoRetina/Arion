import { v4 as uuidv4 } from 'uuid'
import { dbService } from './db-service'
import { PromptModuleService } from './prompt-module-service'
import * as better_sqlite3 from 'better-sqlite3'
import type { AgentDefinition, AgentCapability, AgentPromptConfig, AgentType, AgentRegistryEntry, CreateAgentParams, UpdateAgentParams } from '../../shared/types/agent-types'

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
    return (dbService as any).db
  }
  
  // In-memory cache of agent definitions
  private agentCache: Map<string, AgentDefinition> = new Map()
  
  constructor(promptModuleService: PromptModuleService) {
    this.promptModuleService = promptModuleService
    console.log('[AgentRegistryService] Constructed')
  }
  
  /**
   * Initialize the service and database schema
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    
    console.log('[AgentRegistryService] Initializing...')
    
    // Ensure the prompt module service is initialized
    await this.promptModuleService.initialize()
    
    // Run migrations for agent tables
    await this.runMigrations()
    
    // Load agents into cache
    await this.refreshCache()
    
    this.initialized = true
    console.log('[AgentRegistryService] Initialized successfully')
  }
  
  /**
   * Run migrations to set up agent tables
   */
  private async runMigrations(): Promise<void> {
    console.log('[AgentRegistryService] Running migrations...')
    
    try {
      // Load migration SQL
      const fs = require('fs')
      const path = require('path')
      const app = require('electron').app
      
      // Get the app path (works in development and production)
      const appPath = app.getAppPath()
      console.log(`[AgentRegistryService] App path: ${appPath}`)
      
      // Try to find the migration file in the expected locations
      const migrationFileName = 'add-agent-tables.sql'
      let migrationPath = path.join(appPath, 'out/main/database/migrations', migrationFileName)
      
      if (!fs.existsSync(migrationPath)) {
        // Fall back to src path if out path doesn't exist (development mode)
        migrationPath = path.join(appPath, 'src/main/database/migrations', migrationFileName)
        console.log(`[AgentRegistryService] Trying fallback path: ${migrationPath}`)
      }
      
      if (!fs.existsSync(migrationPath)) {
        console.error(`[AgentRegistryService] Migration file not found at any expected location`)
        throw new Error(`Migration file not found at any expected location`)
      }
      
      const migrationSql = fs.readFileSync(migrationPath, 'utf8')
      
      // Execute migration
      const db = this.getDb()
      db.exec(migrationSql)
      
      console.log('[AgentRegistryService] Migrations completed successfully')
    } catch (error) {
      console.error('[AgentRegistryService] Error running migrations:', error)
      throw error
    }
  }
  
  /**
   * Refresh the in-memory cache from database
   */
  private async refreshCache(): Promise<void> {
    console.log('[AgentRegistryService] Refreshing agent cache...')
    
    try {
      const db = this.getDb()
      
      // Get all agents
      const agents = db.prepare('SELECT * FROM agents').all() as any[]
      
      // Clear existing cache
      this.agentCache.clear()
      
      // Process each agent
      for (const agentRow of agents) {
        const agentId = agentRow.id
        
        // Get agent capabilities
        const capabilities = db
          .prepare('SELECT * FROM agent_capabilities WHERE agent_id = ?')
          .all(agentId) as any[]
        
        // Get agent prompt config
        const promptConfigRow = db
          .prepare('SELECT * FROM agent_prompt_configs WHERE agent_id = ?')
          .get(agentId) as any
        
        if (!promptConfigRow) {
          console.error(`[AgentRegistryService] Missing prompt config for agent ${agentId}`)
          continue
        }
        
        // Parse JSON fields
        const modelConfig = JSON.parse(agentRow.model_config)
        const toolAccess = agentRow.tool_access ? JSON.parse(agentRow.tool_access) : []
        const memoryConfig = agentRow.memory_config ? JSON.parse(agentRow.memory_config) : undefined
        const relationships = agentRow.relationships ? JSON.parse(agentRow.relationships) : undefined
        
        const parsedCapabilities: AgentCapability[] = capabilities.map((cap: any) => ({
          id: cap.id,
          name: cap.name,
          description: cap.description || '',
          tools: JSON.parse(cap.tools),
          exampleTasks: cap.example_tasks ? JSON.parse(cap.example_tasks) : undefined
        }))
        
        const promptConfig: AgentPromptConfig = {
          coreModules: JSON.parse(promptConfigRow.core_modules),
          taskModules: promptConfigRow.task_modules ? JSON.parse(promptConfigRow.task_modules) : undefined,
          agentModules: JSON.parse(promptConfigRow.agent_modules),
          ruleModules: promptConfigRow.rule_modules ? JSON.parse(promptConfigRow.rule_modules) : undefined
        }
        
        // Construct complete agent definition
        const agent: AgentDefinition = {
          id: agentId,
          name: agentRow.name,
          description: agentRow.description || '',
          type: agentRow.type as AgentType,
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
      
      console.log(`[AgentRegistryService] Cache refreshed with ${this.agentCache.size} agents`)
    } catch (error) {
      console.error('[AgentRegistryService] Error refreshing cache:', error)
      throw error
    }
  }
  
  /**
   * Get all agents as lightweight registry entries
   */
  public async getAllAgents(): Promise<AgentRegistryEntry[]> {
    await this.ensureInitialized()
    
    return Array.from(this.agentCache.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      type: agent.type,
      icon: agent.icon,
      capabilities: agent.capabilities.map(cap => cap.id),
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
    
    try {
      const db = this.getDb()
      
      // Start a transaction
      db.exec('BEGIN TRANSACTION')
      
      try {
        // Insert agent record
        db.prepare(`
          INSERT INTO agents
          (id, name, description, type, icon, model_config, tool_access, memory_config, relationships, created_at, updated_at, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          agentId,
          newAgent.name,
          newAgent.description,
          newAgent.type,
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
          
          db.prepare(`
            INSERT INTO agent_capabilities
            (id, agent_id, name, description, tools, example_tasks)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
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
        db.prepare(`
          INSERT INTO agent_prompt_configs
          (id, agent_id, core_modules, task_modules, agent_modules, rule_modules, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          promptConfigId,
          agentId,
          JSON.stringify(newAgent.promptConfig.coreModules),
          newAgent.promptConfig.taskModules ? JSON.stringify(newAgent.promptConfig.taskModules) : null,
          JSON.stringify(newAgent.promptConfig.agentModules),
          newAgent.promptConfig.ruleModules ? JSON.stringify(newAgent.promptConfig.ruleModules) : null,
          now,
          now
        )
        
        // Commit transaction
        db.exec('COMMIT')
        
        // Add to cache
        this.agentCache.set(agentId, newAgent)
        
        console.log(`[AgentRegistryService] Created new agent: ${agentId} - ${newAgent.name}`)
        return newAgent
        
      } catch (innerError) {
        // Rollback transaction on error
        db.exec('ROLLBACK')
        throw innerError
      }
    } catch (error) {
      console.error('[AgentRegistryService] Error creating agent:', error)
      throw error
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
    
    try {
      const db = this.getDb()
      
      // Start a transaction
      db.exec('BEGIN TRANSACTION')
      
      try {
        // Update agent record
        const agentUpdates: any[] = []
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
          agentUpdates.push(updatedAgent.memoryConfig ? JSON.stringify(updatedAgent.memoryConfig) : null)
        }
        
        if (updates.relationships !== undefined) {
          agentUpdateFields.push('relationships = ?')
          agentUpdates.push(updatedAgent.relationships ? JSON.stringify(updatedAgent.relationships) : null)
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
            
            db.prepare(`
              INSERT INTO agent_capabilities
              (id, agent_id, name, description, tools, example_tasks)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(
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
          db.prepare(`
            UPDATE agent_prompt_configs
            SET core_modules = ?,
                task_modules = ?,
                agent_modules = ?,
                rule_modules = ?,
                updated_at = ?
            WHERE agent_id = ?
          `).run(
            JSON.stringify(updatedAgent.promptConfig.coreModules),
            updatedAgent.promptConfig.taskModules ? JSON.stringify(updatedAgent.promptConfig.taskModules) : null,
            JSON.stringify(updatedAgent.promptConfig.agentModules),
            updatedAgent.promptConfig.ruleModules ? JSON.stringify(updatedAgent.promptConfig.ruleModules) : null,
            now,
            id
          )
        }
        
        // Commit transaction
        db.exec('COMMIT')
        
        // Update cache
        this.agentCache.set(id, updatedAgent)
        
        console.log(`[AgentRegistryService] Updated agent: ${id} - ${updatedAgent.name}`)
        return updatedAgent
        
      } catch (innerError) {
        // Rollback transaction on error
        db.exec('ROLLBACK')
        throw innerError
      }
    } catch (error) {
      console.error(`[AgentRegistryService] Error updating agent ${id}:`, error)
      throw error
    }
  }
  
  /**
   * Delete an agent
   */
  public async deleteAgent(id: string): Promise<boolean> {
    await this.ensureInitialized()
    
    try {
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
          console.log(`[AgentRegistryService] Deleted agent: ${id}`)
        } else {
          console.warn(`[AgentRegistryService] No agent found to delete with id: ${id}`)
        }
        
        return success
        
      } catch (innerError) {
        // Rollback transaction on error
        db.exec('ROLLBACK')
        throw innerError
      }
    } catch (error) {
      console.error(`[AgentRegistryService] Error deleting agent ${id}:`, error)
      throw error
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
    
    try {
      const executionId = uuidv4()
      const sessionId = uuidv4() // Generate a unique session ID for this execution
      const now = new Date().toISOString()
      
      const db = this.getDb()
      
      db.prepare(`
        INSERT INTO agent_executions
        (id, agent_id, chat_id, session_id, state, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        executionId,
        agentId,
        chatId,
        sessionId,
        'running', // Set initial state to running
        now
      )
      
      console.log(`[AgentRegistryService] Started execution ${executionId} for agent ${agentId} in chat ${chatId}`)
      return executionId
      
    } catch (error) {
      console.error(`[AgentRegistryService] Error starting execution for agent ${agentId}:`, error)
      throw error
    }
  }
  
  /**
   * Complete an agent execution
   */
  public async completeAgentExecution(executionId: string, error?: string): Promise<void> {
    await this.ensureInitialized()
    
    try {
      const now = new Date().toISOString()
      const state = error ? 'error' : 'completed'
      
      const db = this.getDb()
      
      db.prepare(`
        UPDATE agent_executions
        SET state = ?, completed_at = ?, error = ?
        WHERE id = ?
      `).run(state, now, error || null, executionId)
      
      console.log(`[AgentRegistryService] Completed execution ${executionId} with state ${state}`)
      
    } catch (error) {
      console.error(`[AgentRegistryService] Error completing execution ${executionId}:`, error)
      throw error
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