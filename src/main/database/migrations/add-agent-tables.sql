-- Migration: Add Agent System Tables

-- Table for agent definitions
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('system', 'user-defined')),
  icon TEXT,
  model_config TEXT NOT NULL, -- JSON for model configuration
  tool_access TEXT, -- JSON array of tool IDs this agent can access
  memory_config TEXT, -- JSON for memory configuration
  relationships TEXT, -- JSON for agent relationships
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT -- User ID or 'system'
);

-- Table for agent capabilities
CREATE TABLE IF NOT EXISTS agent_capabilities (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  tools TEXT, -- JSON array of tool IDs
  example_tasks TEXT, -- JSON array of example tasks
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Table for agent prompt configurations
CREATE TABLE IF NOT EXISTS agent_prompt_configs (
  id TEXT PRIMARY KEY,
  agent_id TEXT UNIQUE NOT NULL,
  core_modules TEXT NOT NULL, -- JSON array of module references
  task_modules TEXT, -- JSON array of module references
  agent_modules TEXT NOT NULL, -- JSON array of module references
  rule_modules TEXT, -- JSON array of module references
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Table for agent execution history
CREATE TABLE IF NOT EXISTS agent_executions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'idle',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  error TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);
CREATE INDEX IF NOT EXISTS idx_agent_capabilities_agent_id ON agent_capabilities(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_agent_id ON agent_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_chat_id ON agent_executions(chat_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_state ON agent_executions(state);