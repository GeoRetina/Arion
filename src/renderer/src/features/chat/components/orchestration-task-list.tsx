import React from 'react'
import {
  CheckCircle,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink
} from 'lucide-react'
// Helper function to conditionally join class names
const cn = (...classes: (string | boolean | undefined)[]) => {
  return classes.filter(Boolean).join(' ')
}

/**
 * Represents a subtask in the orchestration task list
 */
export interface OrchestrationSubtask {
  id: string
  description: string
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed'
  assignedAgentId?: string
  assignedAgentName?: string
  dependencies?: string[]
}

/**
 * Props for the OrchestrationTaskList component
 */
interface OrchestrationTaskListProps {
  subtasks: OrchestrationSubtask[]
  className?: string
  onViewSubtaskDetails?: (subtaskId: string) => void
  agentSpecialties?: Record<string, string[]>
}

/**
 * Component for displaying orchestration subtasks in a to-do list format
 */
const OrchestrationTaskList: React.FC<OrchestrationTaskListProps> = ({
  subtasks,
  className,
  onViewSubtaskDetails,
  agentSpecialties = {}
}) => {
  const [expandedTasks, setExpandedTasks] = React.useState<Record<string, boolean>>({})

  // Toggle task expanded state
  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTasks((prev) => ({
      ...prev,
      [taskId]: !prev[taskId]
    }))
  }

  // Render status indicator for each task
  const renderStatusIcon = (status: OrchestrationSubtask['status']) => {
    switch (status) {
      case 'pending':
        return <div className="h-4 w-4 rounded-full border border-gray-300 dark:border-gray-600" />
      case 'assigned':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-pulse" />
      case 'in_progress':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
        return <AlertTriangle className="h-4 w-4 text-red-500" />
    }
  }

  // No subtasks to display
  if (!subtasks || subtasks.length === 0) {
    return null
  }

  return (
    <div className={cn('my-4 rounded-lg border border-border p-4 bg-muted/30', className)}>
      <h3 className="text-sm font-medium mb-3">Task Execution Plan</h3>

      <div className="space-y-2">
        {subtasks.map((task) => (
          <div
            key={task.id}
            className={cn(
              'border rounded-md p-3',
              task.status === 'completed'
                ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20'
                : task.status === 'failed'
                  ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20'
                  : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
            )}
          >
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => toggleTaskExpanded(task.id)}
            >
              <div className="flex-shrink-0">{renderStatusIcon(task.status)}</div>

              <div className="flex-grow">
                <p className="text-sm font-medium">{task.description}</p>
              </div>

              {task.assignedAgentId && (
                <div className="flex-shrink-0">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                    {task.assignedAgentName || task.assignedAgentId}
                  </span>
                </div>
              )}

              {expandedTasks[task.id] ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>

            {expandedTasks[task.id] && (
              <div className="mt-2 text-xs pt-2 border-t border-gray-200 dark:border-gray-800">
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div>
                    <p className="text-muted-foreground">Status:</p>
                    <p className="font-medium capitalize">{task.status.replace('_', ' ')}</p>
                  </div>

                  {task.assignedAgentId && (
                    <div>
                      <p className="text-muted-foreground">Assigned Agent:</p>
                      <p className="font-medium">
                        {task.assignedAgentName || task.assignedAgentId}
                      </p>
                      {agentSpecialties[task.assignedAgentId] && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {agentSpecialties[task.assignedAgentId].slice(0, 2).map((specialty) => (
                            <span
                              key={specialty}
                              className="inline-block px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 rounded"
                            >
                              {specialty}
                            </span>
                          ))}
                          {agentSpecialties[task.assignedAgentId].length > 2 && (
                            <span className="text-xs text-muted-foreground">
                              +{agentSpecialties[task.assignedAgentId].length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {onViewSubtaskDetails && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onViewSubtaskDetails(task.id)
                    }}
                    className="mt-2 flex items-center text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    View details <ExternalLink className="ml-1 h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-between text-xs text-muted-foreground">
        <span>Total tasks: {subtasks.length}</span>
        <span>
          Completed: {subtasks.filter((t) => t.status === 'completed').length}/{subtasks.length}
        </span>
      </div>
    </div>
  )
}

export default OrchestrationTaskList
