import React, { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, FileText } from 'lucide-react'
import {
  useKnowledgeBaseStore,
  Document,
  Folder,
  WorkspaceMemory
} from '../stores/knowledge-base-store'
import { DocumentsTable } from './documents-table'
import { WorkspaceMemoriesTable } from './workspace-memories-table'
import { FolderManager } from './folder-manager'
import { DocumentForm } from './document-form'
import { FolderForm } from './folder-form'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { WorkspaceMemoryForm } from './workspace-memory-form'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'

type DocumentDeleteTarget = Document | { id: 'bulk-delete-trigger'; name?: string }

function KnowledgeBase(): React.JSX.Element {
  const {
    documents,
    workspaceMemories,
    folders,
    deleteDocumentAndEmbeddings,
    fetchDocuments,
    fetchWorkspaceMemories,
    deleteFolder,
    updateWorkspaceMemoryEntry,
    deleteWorkspaceMemoryEntry
  } = useKnowledgeBaseStore()

  // State for managing UI interactions
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState('')
  const [documentToEdit, setDocumentToEdit] = useState<Document | undefined>(undefined)
  const [folderToEdit, setFolderToEdit] = useState<Folder | undefined>(undefined)
  const [documentToDelete, setDocumentToDelete] = useState<DocumentDeleteTarget | undefined>(
    undefined
  )
  const [folderToDelete, setFolderToDelete] = useState<Folder | undefined>(undefined)
  const [isAddDocumentOpen, setIsAddDocumentOpen] = useState(false)
  const [isAddFolderOpen, setIsAddFolderOpen] = useState(false)
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])
  const [memoryToEdit, setMemoryToEdit] = useState<WorkspaceMemory | undefined>(undefined)
  const [memoryToDelete, setMemoryToDelete] = useState<WorkspaceMemory | undefined>(undefined)
  const [isEditMemoryOpen, setIsEditMemoryOpen] = useState(false)
  const [isMemorySubmitting, setIsMemorySubmitting] = useState(false)

  // Fetch documents on component mount
  useEffect(() => {
    fetchDocuments()
    fetchWorkspaceMemories(200)
  }, [fetchDocuments, fetchWorkspaceMemories])

  // Create a folder name lookup object for quick access
  const folderNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    folders.forEach((folder) => {
      map[folder.id] = folder.name
    })
    return map
  }, [folders])

  // Handlers for document operations
  const handleAddDocument = (): void => {
    setDocumentToEdit(undefined)
    setIsAddDocumentOpen(true)
  }

  const handleEditDocument = (document: Document): void => {
    setDocumentToEdit(document)
    setIsAddDocumentOpen(true)
  }

  const handleDeleteDocument = (document: Document): void => {
    setDocumentToDelete(document)
  }

  const confirmDeleteDocument = (): void => {
    if (documentToDelete) {
      deleteDocumentAndEmbeddings(documentToDelete.id)
      setDocumentToDelete(undefined)
      setSelectedDocumentIds([])
    }
  }

  // Handlers for folder operations
  const handleAddFolder = (): void => {
    setFolderToEdit(undefined)
    setIsAddFolderOpen(true)
  }

  const handleEditFolder = (folder: Folder): void => {
    setFolderToEdit(folder)
    setIsAddFolderOpen(true)
  }

  const handleDeleteFolder = (folder: Folder): void => {
    setFolderToDelete(folder)
  }

  const confirmDeleteFolder = (): void => {
    if (folderToDelete) {
      deleteFolder(folderToDelete.id)
      // If we're currently viewing the folder being deleted, go back to All Documents
      if (currentFolderId === folderToDelete.id) {
        setCurrentFolderId(undefined)
      }
      setFolderToDelete(undefined)
    }
  }

  const confirmBulkDeleteDocuments = (): void => {
    selectedDocumentIds.forEach((id) => {
      deleteDocumentAndEmbeddings(id)
    })
    setSelectedDocumentIds([])
  }

  const handleEditMemory = (memory: WorkspaceMemory): void => {
    setMemoryToEdit(memory)
    setIsEditMemoryOpen(true)
  }

  const handleDeleteMemory = (memory: WorkspaceMemory): void => {
    setMemoryToDelete(memory)
  }

  const handleSubmitMemoryUpdate = async (
    payload: Parameters<typeof updateWorkspaceMemoryEntry>[0]
  ): Promise<void> => {
    setIsMemorySubmitting(true)
    try {
      const updated = await updateWorkspaceMemoryEntry(payload)
      toast.success('Workspace memory updated', {
        description: `Updated memory "${updated.summary.slice(0, 80)}${updated.summary.length > 80 ? '...' : ''}".`
      })
      setIsEditMemoryOpen(false)
      setMemoryToEdit(undefined)
    } catch (error) {
      toast.error('Failed to update workspace memory', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsMemorySubmitting(false)
    }
  }

  const confirmDeleteMemory = async (): Promise<void> => {
    if (!memoryToDelete) {
      return
    }

    try {
      await deleteWorkspaceMemoryEntry(memoryToDelete.id)
      toast.success('Workspace memory deleted')
      setMemoryToDelete(undefined)
    } catch (error) {
      toast.error('Failed to delete workspace memory', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Currently selected folder (for UI display)
  const currentFolder = currentFolderId ? folders.find((f) => f.id === currentFolderId) : undefined

  // Count documents in the current folder (or total if no folder selected)
  const documentCount = currentFolderId
    ? documents.filter((doc) => doc.folderId === currentFolderId).length
    : documents.length

  const showAddButtonInTable = !(documents.length === 0 && folders.length === 0)
  const hasDocumentsOrFolders = documents.length > 0 || folders.length > 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 md:px-6 py-8 shrink-0">
        <div className="flex items-center space-x-2">
          <h1 className="text-3xl font-semibold">Knowledge Base</h1>
        </div>
      </div>

      <Tabs defaultValue="documents" className="flex-1 overflow-hidden">
        <div className="px-4 md:px-6 pt-4">
          <TabsList>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="workspace-memories">Workspace Memories</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="documents" className="overflow-hidden h-full">
          <div className="flex h-full overflow-hidden">
            {/* Folder sidebar */}
            <div className="w-64 p-4 shrink-0">
              <FolderManager
                folders={folders}
                currentFolderId={currentFolderId}
                onFolderSelect={setCurrentFolderId}
                onAddFolder={handleAddFolder}
                onEditFolder={handleEditFolder}
                onDeleteFolder={handleDeleteFolder}
              />
            </div>

            {/* Main content area */}
            <div className="flex-1 p-6 flex flex-col overflow-auto">
              {currentFolder && (
                <div className="flex items-center space-x-2 mb-4">
                  <span className="text-muted-foreground">/</span>
                  <span className="font-medium">{currentFolder.name}</span>
                  <span className="ml-3 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                    {documentCount} document{documentCount !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              {hasDocumentsOrFolders ? (
                <div className="relative min-h-[420px]">
                  <DocumentsTable
                    documents={documents}
                    folders={folderNameMap}
                    onEditDocument={handleEditDocument}
                    onDeleteDocument={handleDeleteDocument}
                    currentFolderId={currentFolderId}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onAddDocument={handleAddDocument}
                    showAddDocumentButton={showAddButtonInTable}
                    onSelectionChange={setSelectedDocumentIds}
                    selectedDocumentIds={selectedDocumentIds}
                    onBulkDelete={() => setDocumentToDelete({ id: 'bulk-delete-trigger' })}
                  />
                </div>
              ) : (
                <div className="mb-6 rounded-md border px-6 py-10 flex flex-col items-center justify-center text-center">
                  <FileText className="h-16 w-16 text-muted-foreground/60 mb-4" />
                  <h3 className="text-xl font-semibold">No documents yet</h3>
                  <p className="text-muted-foreground mt-2 mb-6 max-w-md">
                    Add documents to your knowledge base to enable RAG capabilities in your AI
                    assistants.
                  </p>
                  <div className="flex space-x-4">
                    <Button onClick={handleAddDocument}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Document
                    </Button>
                    <Button variant="outline" onClick={handleAddFolder}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Folder
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="workspace-memories" className="overflow-hidden h-full">
          <div className="flex-1 p-6 flex flex-col overflow-auto h-full">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Workspace Memories</h2>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                {workspaceMemories.length} entr{workspaceMemories.length === 1 ? 'y' : 'ies'}
              </span>
            </div>
            <WorkspaceMemoriesTable
              memories={workspaceMemories}
              onEditMemory={handleEditMemory}
              onDeleteMemory={handleDeleteMemory}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Document Dialog */}
      <DocumentForm
        isOpen={isAddDocumentOpen}
        onClose={() => setIsAddDocumentOpen(false)}
        documentToEdit={documentToEdit}
      />

      {/* Add/Edit Folder Dialog */}
      <FolderForm
        isOpen={isAddFolderOpen}
        onClose={() => setIsAddFolderOpen(false)}
        folderToEdit={folderToEdit}
      />

      <WorkspaceMemoryForm
        isOpen={isEditMemoryOpen}
        onClose={() => {
          setIsEditMemoryOpen(false)
          setMemoryToEdit(undefined)
        }}
        memoryToEdit={memoryToEdit}
        onSubmit={handleSubmitMemoryUpdate}
        isSubmitting={isMemorySubmitting}
      />

      {/* Delete Document Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={!!documentToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setDocumentToDelete(undefined)
            if (documentToDelete && documentToDelete.id !== 'bulk-delete-trigger') {
              setSelectedDocumentIds([])
            }
          }
        }}
        onConfirm={() => {
          if (documentToDelete && documentToDelete.id !== 'bulk-delete-trigger') {
            confirmDeleteDocument()
          } else if (selectedDocumentIds.length > 0) {
            confirmBulkDeleteDocuments()
            setDocumentToDelete(undefined)
          }
        }}
        title={
          documentToDelete && documentToDelete.id !== 'bulk-delete-trigger'
            ? 'Delete Document'
            : `Delete ${selectedDocumentIds.length} Document(s)`
        }
        description={
          documentToDelete && documentToDelete.id !== 'bulk-delete-trigger'
            ? `Are you sure you want to delete "${documentToDelete?.name}"? This action cannot be undone.`
            : `Are you sure you want to delete these ${selectedDocumentIds.length} documents? This action cannot be undone.`
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />

      {/* Delete Folder Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={!!folderToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setFolderToDelete(undefined)
          }
        }}
        onConfirm={confirmDeleteFolder}
        title="Delete Folder"
        description={`Are you sure you want to delete the folder "${folderToDelete?.name}"? Documents inside this folder will be moved to root level.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />

      <ConfirmationDialog
        isOpen={!!memoryToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setMemoryToDelete(undefined)
          }
        }}
        onConfirm={() => {
          void confirmDeleteMemory()
        }}
        title="Delete Workspace Memory"
        description="Are you sure you want to delete this memory entry? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  )
}

export default KnowledgeBase
