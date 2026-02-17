import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type {
  KnowledgeBaseDocumentForClient,
  WorkspaceMemoryForClient
} from '../../../../../shared/ipc-types'

// Store's internal Document type - uses camelCase and Date objects
export interface Document {
  id: string
  name: string
  originalFileName: string // Corresponds to original_file_name
  filePath?: string | null // Corresponds to file_path
  fileType: string // Corresponds to file_type
  fileSize: number // Corresponds to file_size
  folderId?: string | null // Corresponds to folder_id
  description?: string | null
  chunkCount?: number | null // Corresponds to chunk_count
  createdAt: Date // Will be Date object
  updatedAt: Date // Will be Date object
}

export interface Folder {
  id: string
  name: string
  description?: string
  createdAt: Date
  updatedAt: Date
}

export interface WorkspaceMemory {
  id: string
  chatId: string
  scope: 'chat' | 'global'
  sourceKey: string
  sourceMessageId?: string
  memoryType: 'session_outcome' | 'tool_outcome'
  agentId?: string
  toolName?: string
  summary: string
  details?: unknown
  createdAt: Date
}

interface KnowledgeBaseState {
  documents: Document[]
  workspaceMemories: WorkspaceMemory[]
  folders: Folder[]
  isLoading: boolean
  error: string | null

  // Document actions
  setDocuments: (documents: Document[]) => void
  setWorkspaceMemories: (memories: WorkspaceMemory[]) => void
  addDocument: (docFromBackend: KnowledgeBaseDocumentForClient) => void // Updated to accept backend type
  updateDocument: (
    // Ensure this signature is correct
    id: string,
    updates: Partial<Omit<Document, 'id' | 'createdAt' | 'updatedAt'>>
  ) => void
  removeDocument: (id: string) => void
  fetchDocuments: () => Promise<void>
  fetchWorkspaceMemories: (limit?: number) => Promise<void>
  deleteDocumentAndEmbeddings: (id: string) => Promise<void>

  // Folder actions
  addFolder: (name: string, description?: string) => void
  updateFolder: (
    id: string,
    updates: Partial<Omit<Folder, 'id' | 'createdAt' | 'updatedAt'>>
  ) => void
  deleteFolder: (id: string) => void
}

export const useKnowledgeBaseStore = create<KnowledgeBaseState>((set, get) => ({
  documents: [],
  workspaceMemories: [],
  folders: [],
  isLoading: false,
  error: null,

  // Document actions
  setDocuments: (documents) => set({ documents, isLoading: false, error: null }),
  setWorkspaceMemories: (workspaceMemories) => set({ workspaceMemories }),

  addDocument: (docFromBackend) => {
    const newDocument: Document = {
      id: docFromBackend.id,
      name: docFromBackend.name,
      originalFileName: docFromBackend.original_file_name,
      filePath: docFromBackend.filePath === null ? undefined : docFromBackend.filePath,
      fileType: docFromBackend.file_type,
      fileSize: docFromBackend.file_size,
      folderId: docFromBackend.folder_id === null ? undefined : docFromBackend.folder_id,
      description: docFromBackend.description === null ? undefined : docFromBackend.description,
      chunkCount: docFromBackend.chunk_count === null ? undefined : docFromBackend.chunk_count,
      createdAt: new Date(docFromBackend.created_at),
      updatedAt: new Date(docFromBackend.updated_at)
    }
    set((state) => ({
      documents: state.documents.find((d) => d.id === newDocument.id)
        ? state.documents.map((d) => (d.id === newDocument.id ? newDocument : d))
        : [...state.documents, newDocument]
    }))
  },

  updateDocument: (id, updates) =>
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...doc, ...updates, updatedAt: new Date() } : doc
      )
    })),

  removeDocument: (id) =>
    set((state) => ({
      documents: state.documents.filter((doc) => doc.id !== id)
    })),

  fetchDocuments: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await window.ctg.knowledgeBase.getAllDocuments()
      // The response is an IPCResponse, documents are in response.data
      if (response.success && response.data) {
        const storeDocuments: Document[] = response.data.map(
          (doc: KnowledgeBaseDocumentForClient) => ({
            id: doc.id,
            name: doc.name,
            originalFileName: doc.original_file_name,
            filePath: doc.filePath === null ? undefined : doc.filePath,
            fileType: doc.file_type,
            fileSize: doc.file_size,
            folderId: doc.folder_id === null ? undefined : doc.folder_id,
            description: doc.description === null ? undefined : doc.description,
            chunkCount: doc.chunk_count === null ? undefined : doc.chunk_count,
            createdAt: new Date(doc.created_at),
            updatedAt: new Date(doc.updated_at)
          })
        )
        set({ documents: storeDocuments, isLoading: false })
      } else {
        // If response.success is false, or data is missing, throw an error with the message from response.error
        throw new Error(response.error || 'Failed to fetch documents from KnowledgeBaseService')
      }
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message })
    }
  },

  fetchWorkspaceMemories: async (limit?: number) => {
    try {
      const response = await window.ctg.knowledgeBase.getWorkspaceMemories(limit)
      if (response.success && response.data) {
        const workspaceMemories: WorkspaceMemory[] = response.data.map(
          (memory: WorkspaceMemoryForClient) => ({
            id: memory.id,
            chatId: memory.chatId,
            scope: memory.scope,
            sourceKey: memory.sourceKey,
            sourceMessageId: memory.sourceMessageId,
            memoryType: memory.memoryType,
            agentId: memory.agentId,
            toolName: memory.toolName,
            summary: memory.summary,
            details: memory.details,
            createdAt: new Date(memory.createdAt)
          })
        )
        set({ workspaceMemories, error: null })
      } else {
        throw new Error(response.error || 'Failed to fetch workspace memories')
      }
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  deleteDocumentAndEmbeddings: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      // Updated to use the new IPC channel for PGlite-backed documents
      const response = await window.ctg.knowledgeBase.deleteDocument(id)
      if (response.success) {
        get().removeDocument(id) // Call local removeDocument action to update UI
        set({ isLoading: false }) // Reset loading state
      } else {
        throw new Error(
          response.error || `Failed to delete document ${id} via KnowledgeBaseService`
        )
      }
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message })
    }
  },

  // Folder actions
  addFolder: (name, description) =>
    set((state) => ({
      folders: [
        ...state.folders,
        {
          id: uuidv4(),
          name,
          description,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]
    })),

  updateFolder: (id, updates) =>
    set((state) => ({
      folders: state.folders.map((folder) =>
        folder.id === id ? { ...folder, ...updates, updatedAt: new Date() } : folder
      )
    })),

  deleteFolder: (id) =>
    set((state) => ({
      folders: state.folders.filter((folder) => folder.id !== id),
      documents: state.documents.map((doc) =>
        doc.folderId === id ? { ...doc, folderId: undefined, updatedAt: new Date() } : doc
      )
    }))
}))
