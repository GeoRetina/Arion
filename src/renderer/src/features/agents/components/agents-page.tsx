import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { PlusCircle, Loader2, Search } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAgentStore } from '@/stores/agent-store'
import AgentCard from './agent-card'
import AgentCreationModal from './agent-creation-modal'
import AgentEditorModal from './agent-editor-modal'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

const AgentsPage: React.FC = () => {
  // State for search and filters
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  // Get agents and actions from store
  const { agents, isLoading, error, loadAgents, deleteAgent, resetError } = useAgentStore()

  // Load agents on component mount
  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  // Show error toast if there's an error
  useEffect(() => {
    if (error) {
      toast.error('Error loading agents', {
        description: error,
        duration: 5000
      })
      resetError()
    }
  }, [error, resetError])

  // Filter agents based on search query and type filter
  const filteredAgents = agents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesType = typeFilter === 'all' || agent.type === typeFilter

    return matchesSearch && matchesType
  })

  // Handle agent edit
  const handleEditAgent = (agentId: string) => {
    setSelectedAgentId(agentId)
    setIsEditorModalOpen(true)
  }

  // Handle agent delete
  const handleDeleteAgent = async (agentId: string) => {
    const result = await deleteAgent(agentId)
    if (result) {
      toast.success('Agent deleted successfully')
    } else {
      toast.error('Failed to delete agent')
    }
  }

  // Handle create new agent
  const handleCreateAgent = () => {
    setIsCreateModalOpen(true)
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-8 px-4 md:px-6">
        <div className="flex flex-col items-start gap-6">
          {/* Header */}
          <div className="w-full">
            <h1 className="text-3xl font-semibold mb-2">AI Agents</h1>
            <p className="text-muted-foreground max-w-2xl">
              Manage your AI agents and their capabilities. Create specialized agents for
              different tasks.
            </p>
          </div>

          {/* Filters and Actions */}
          <div className="flex flex-col md:flex-row gap-4 w-full md:items-center">
            <div className="md:w-1/3 lg:w-1/4">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search agents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="user-defined">User-defined</SelectItem>
              </SelectContent>
            </Select>
            <Button className="flex items-center gap-2 md:ml-8" onClick={handleCreateAgent}>
              <PlusCircle className="h-4 w-4" />
              New Agent
            </Button>
          </div>

          {/* Agent Cards */}
          {isLoading ? (
            <div className="w-full flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredAgents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full">
              {filteredAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onEdit={handleEditAgent}
                  onDelete={handleDeleteAgent}
                />
              ))}
            </div>
          ) : (
            <div className="w-full text-center py-12 border border-dashed rounded-lg">
              <p className="text-muted-foreground mb-2">No agents found</p>
              <p className="text-sm text-muted-foreground">
                {searchQuery || typeFilter !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Create your first agent to get started'}
              </p>
            </div>
          )}
        </div>
      </div>
      {/* Modals */}
      <AgentCreationModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
      <AgentEditorModal
        agentId={selectedAgentId}
        isOpen={isEditorModalOpen}
        onClose={() => {
          setIsEditorModalOpen(false)
          loadAgents() // Refresh the agent list after editing
        }}
      />
    </ScrollArea>
  )
}

export default AgentsPage
