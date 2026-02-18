import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Edit, Trash } from 'lucide-react'
import { WorkspaceMemory } from '../stores/knowledge-base-store'
import { formatRelativeTime } from '../utils/format-utils'

interface WorkspaceMemoriesTableProps {
  memories: WorkspaceMemory[]
  onEditMemory: (memory: WorkspaceMemory) => void
  onDeleteMemory: (memory: WorkspaceMemory) => void
}

function getMemorySourceLabel(memory: WorkspaceMemory): string {
  if (memory.toolName) {
    return `Tool: ${memory.toolName}`
  }
  if (memory.agentId) {
    return `Agent: ${memory.agentId}`
  }
  return 'System'
}

function compactChatId(chatId: string): string {
  if (chatId.length <= 16) {
    return chatId
  }
  return `${chatId.slice(0, 8)}...${chatId.slice(-6)}`
}

export function WorkspaceMemoriesTable({
  memories,
  onEditMemory,
  onDeleteMemory
}: WorkspaceMemoriesTableProps): React.JSX.Element {
  const sortedMemories = [...memories].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return (
    <ScrollArea className="max-h-[320px] rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="w-[120px]">Scope</TableHead>
            <TableHead className="w-[140px]">Type</TableHead>
            <TableHead>Summary</TableHead>
            <TableHead className="w-[180px]">Source</TableHead>
            <TableHead className="w-[150px]">Chat</TableHead>
            <TableHead className="w-[130px]">Created</TableHead>
            <TableHead className="w-[90px] text-right pr-6">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedMemories.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                No workspace memories captured yet.
              </TableCell>
            </TableRow>
          ) : (
            sortedMemories.map((memory) => (
              <TableRow key={memory.id}>
                <TableCell>
                  <Badge variant={memory.scope === 'global' ? 'default' : 'secondary'}>
                    {memory.scope === 'global' ? 'Global' : 'Chat'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {memory.memoryType === 'tool_outcome' ? 'Tool outcome' : 'Session outcome'}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-normal">{memory.summary}</TableCell>
                <TableCell>{getMemorySourceLabel(memory)}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {compactChatId(memory.chatId)}
                </TableCell>
                <TableCell>{formatRelativeTime(memory.createdAt)}</TableCell>
                <TableCell className="text-right pr-6">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onEditMemory(memory)}>
                        <Edit className="mr-2 h-4 w-4" />
                        <span>Edit</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDeleteMemory(memory)}>
                        <Trash className="mr-2 h-4 w-4" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <ScrollBar orientation="vertical" />
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
