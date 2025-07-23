import React, { useState, useMemo } from 'react'
import { useChatHistoryStore } from '../../../stores/chat-history-store'
// Button and PlusCircle might not be needed if New Chat button is removed
import { Button } from '../../../components/ui/button'
// import { PlusCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
// import { v4 as uuidv4 } from 'uuid' // uuidv4 no longer needed here
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '../../../components/ui/table'
import { Checkbox } from '../../../components/ui/checkbox'
import { Trash2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

// TODO: Add a utility to generate a unique ID (e.g., UUID) for new chats if not provided by backend strategy.
// For now, expecting an ID to be passed to createChatAndSelect if needed by the store,
// or the store/service handles ID generation.

export const ChatHistoryList: React.FC = () => {
  const navigate = useNavigate()
  const chats = useChatHistoryStore((state) => state.chats)
  const isLoadingChats = useChatHistoryStore((state) => state.isLoadingChats)
  const deleteChatAndUpdateList = useChatHistoryStore((state) => state.deleteChatAndUpdateList)
  const currentChatIdFromStore = useChatHistoryStore((state) => state.currentChatId)

  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([])

  const handleSelectChat = (chatId: string) => {
    navigate(`/chat/${chatId}`)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      setSelectedChatIds(chats.map((chat) => chat.id))
    } else {
      setSelectedChatIds([])
    }
  }

  const handleRowSelect = (chatId: string, checked: boolean) => {
    setSelectedChatIds((prevSelected) =>
      checked ? [...prevSelected, chatId] : prevSelected.filter((id) => id !== chatId)
    )
  }

  const handleDeleteSelected = async () => {
    if (selectedChatIds.length === 0) return
    if (
      window.confirm(`Are you sure you want to delete ${selectedChatIds.length} selected chat(s)?`)
    ) {
      for (const chatId of selectedChatIds) {
        await deleteChatAndUpdateList(chatId)
        if (currentChatIdFromStore === chatId) {
          navigate('/history', { replace: true })
        }
      }
      setSelectedChatIds([])
    }
  }

  const isAllSelected = useMemo(
    () => chats.length > 0 && selectedChatIds.length === chats.length,
    [chats, selectedChatIds]
  )
  const isIndeterminate = useMemo(
    () => selectedChatIds.length > 0 && selectedChatIds.length < chats.length,
    [selectedChatIds, chats]
  )

  if (isLoadingChats) {
    return <div className="p-4 text-sm text-gray-500 text-center">Loading chat history...</div>
  }

  return (
    <div className="py-8 px-4 md:px-6 flex flex-col h-[calc(100vh-theme(spacing.24))] overflow-hidden">
      <div className="flex flex-col mb-4 flex-shrink-0">
        <h1 className="text-3xl font-semibold mb-2">Chat History</h1>
        <p className="text-sm text-muted-foreground mb-4">
          A list of your recent chat sessions. Click a row to open.
        </p>
        <div className="flex justify-end">
          {selectedChatIds.length > 0 && (
            <Button variant="destructive" onClick={handleDeleteSelected}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Selected ({selectedChatIds.length})
            </Button>
          )}
        </div>
      </div>

      {chats.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400 py-10">No chat history found.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden flex-grow relative">
          <ScrollArea className="h-full">
            <div className="sticky top-0 z-10 bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 bg-background">
                      <Checkbox
                        checked={isIndeterminate ? 'indeterminate' : isAllSelected}
                        onCheckedChange={(value) =>
                          handleSelectAll(value === 'indeterminate' ? false : value)
                        }
                        aria-label="Select all rows"
                      />
                    </TableHead>
                    <TableHead className="w-[50%] bg-background">Title</TableHead>
                    <TableHead className="bg-background">Last Updated</TableHead>
                    <TableHead className="bg-background">Created At</TableHead>
                  </TableRow>
                </TableHeader>
              </Table>
            </div>
            <Table>
              <TableBody>
                {chats.map((chat) => (
                  <TableRow
                    key={chat.id}
                    data-state={selectedChatIds.includes(chat.id) ? 'selected' : undefined}
                  >
                    <TableCell className="w-12">
                      <Checkbox
                        checked={selectedChatIds.includes(chat.id)}
                        onCheckedChange={(checked) => handleRowSelect(chat.id, !!checked)}
                        aria-label={`Select row for chat ${chat.title || chat.id}`}
                      />
                    </TableCell>
                    <TableCell
                      className="font-medium truncate cursor-pointer hover:underline"
                      onClick={() => handleSelectChat(chat.id)}
                    >
                      {chat.title || `Chat ${chat.id.substring(0, 8)}...`}
                    </TableCell>
                    <TableCell>{formatDate(chat.updated_at)}</TableCell>
                    <TableCell>{formatDate(chat.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
