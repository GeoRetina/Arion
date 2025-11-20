-- Migration: Add agent role field
-- Adds a role field to the agents table and sets existing agent roles based on capabilities

-- Add role column to agents table
ALTER TABLE agents ADD COLUMN role TEXT CHECK (role IN ('orchestrator', 'specialist')) DEFAULT 'specialist';

-- Update existing agents: set as orchestrator if they have 'orchestrat' in any capability name or description
UPDATE agents
SET role = 'orchestrator'
WHERE id IN (
  SELECT DISTINCT a.id
  FROM agents a
  JOIN agent_capabilities ac ON a.id = ac.agent_id
  WHERE LOWER(ac.name) LIKE '%orchestrat%' OR LOWER(ac.description) LIKE '%orchestrat%'
);

-- Set all other agents to 'specialist' by default
UPDATE agents
SET role = 'specialist'
WHERE role IS NULL;

-- Create an index on the role field for performance
CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(role);
