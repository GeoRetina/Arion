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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

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
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const handleSelectChat = (chatId: string): void => {
    navigate(`/chat/${chatId}`)
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleSelectAll = (checked: boolean | 'indeterminate'): void => {
    if (checked === true) {
      setSelectedChatIds(chats.map((chat) => chat.id))
    } else {
      setSelectedChatIds([])
    }
  }

  const handleRowSelect = (chatId: string, checked: boolean): void => {
    setSelectedChatIds((prevSelected) =>
      checked ? [...prevSelected, chatId] : prevSelected.filter((id) => id !== chatId)
    )
  }

  const handleDeleteSelected = async (): Promise<void> => {
    if (selectedChatIds.length === 0) return

    for (const chatId of selectedChatIds) {
      await deleteChatAndUpdateList(chatId)
      if (currentChatIdFromStore === chatId) {
        navigate('/history', { replace: true })
      }
    }
    setSelectedChatIds([])
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
    <div className="pt-8 pb-2 px-4 md:px-6 flex flex-col h-[calc(100vh-1rem)] overflow-hidden relative">
      <div className="flex flex-col mb-4 flex-shrink-0">
        <h1 className="text-3xl font-semibold mb-2">Chat History</h1>
        <p className="text-sm text-muted-foreground mb-4">
          A list of your recent chat sessions. Click a row to open.
        </p>
      </div>

      {chats.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400 py-10">No chat history found.</p>
      ) : (
        <div className="rounded-lg overflow-hidden flex-grow relative surface-elevated">
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
                      className="w-[50%] font-medium truncate cursor-pointer hover:underline"
                      onClick={() => handleSelectChat(chat.id)}
                    >
                      {chat.title || `Chat ${chat.id.substring(0, 8)}...`}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(chat.updated_at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(chat.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      )}

      {/* Floating delete button dock */}
      {selectedChatIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-background border rounded-lg shadow-lg px-6 py-3 flex items-center gap-4">
            <span className="text-sm font-medium">
              {selectedChatIds.length} {selectedChatIds.length === 1 ? 'chat' : 'chats'} selected
            </span>
            <Button variant="destructive" size="sm" onClick={() => setIsDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title={`Delete ${selectedChatIds.length === 1 ? 'Chat' : 'Chats'}?`}
        description={`Are you sure you want to delete ${selectedChatIds.length} selected ${selectedChatIds.length === 1 ? 'chat' : 'chats'}? This action cannot be undone and will permanently remove the ${selectedChatIds.length === 1 ? 'chat' : 'chats'} from your history.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDeleteSelected}
        variant="destructive"
      />
    </div>
  )
}
