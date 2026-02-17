import React from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { WorkspaceMemory } from '../stores/knowledge-base-store'
import { formatRelativeTime } from '../utils/format-utils'

interface WorkspaceMemoriesTableProps {
  memories: WorkspaceMemory[]
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
  memories
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedMemories.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
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
