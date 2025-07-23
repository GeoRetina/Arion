import { type IpcMain } from 'electron'
import {
  IpcChannels,
  KBAddDocumentPayload,
  KBRecordForClient,
  KBAddDocumentResult,
  KnowledgeBaseDocumentForClient
} from '../../shared/ipc-types' // Assuming this path is correct
import { KnowledgeBaseService } from '../services/knowledge-base-service'
import { nanoid } from 'nanoid' // For generating document IDs if not provided by frontend

export function registerKnowledgeBaseIpcHandlers(
  ipcMain: IpcMain,
  kbService: KnowledgeBaseService
): void {
  ipcMain.handle(
    IpcChannels.kbAddDocument,
    async (
      _event,
      payload: KBAddDocumentPayload
    ): Promise<KBAddDocumentResult & { document?: KnowledgeBaseDocumentForClient }> => {
      if (!kbService) {
        console.error(
          '[KB Handlers IPC] KnowledgeBaseService instance is not available for ctg:kb:addDocument.'
        )
        return {
          success: false,
          error: 'KnowledgeBaseService not initialized in main process.'
        }
      }
      try {
        console.log(
          `[KB Handlers IPC] Received ${IpcChannels.kbAddDocument} for document ID: ${payload.documentId}, filePath: ${payload.filePath || 'N/A'}`
        )

        // kbService.addDocumentFromFile now directly returns the KnowledgeBaseDocumentForClient object
        // and handles all database operations internally (PGlite transaction for metadata and chunks).
        const documentFromKbService: KnowledgeBaseDocumentForClient =
          await kbService.addDocumentFromFile(payload)

        // No more interaction with dbService here for document metadata.
        // The documentFromKbService is the source of truth.
        return {
          success: true,
          documentId: documentFromKbService.id,
          document: documentFromKbService
        }
      } catch (error) {
        console.error(`[KB Handlers IPC] Error in ${IpcChannels.kbAddDocument}:`, error)
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.'
        return {
          success: false,
          documentId: payload.documentId, // Include documentId even on error if available
          error: errorMessage
        }
      }
    }
  )

  ipcMain.handle(
    IpcChannels.kbFindSimilar,
    // The query parameter from the frontend should be a string
    async (_event, queryString: string, limit?: number) => {
      console.log(
        `[KB Handlers IPC] Received ${IpcChannels.kbFindSimilar} with query: ${queryString.substring(0, 50)}...`
      )
      if (typeof queryString !== 'string') {
        console.error('[KB Handlers IPC] kbFindSimilar: query must be a string.')
        return { success: false, error: 'Query must be a string.' }
      }
      try {
        // 1. Generate embedding for the query string using the service method
        const queryEmbedding = await kbService.embedText(queryString)

        // 2. Find similar chunks using the generated embedding
        const results = await kbService.findSimilarChunks(queryEmbedding, limit)
        return { success: true, data: results }
      } catch (error) {
        console.error(`[KB Handlers IPC] Error in ${IpcChannels.kbFindSimilar}:`, error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(IpcChannels.kbGetChunkCount, async (_event) => {
    console.log(`[KB Handlers IPC] Received ${IpcChannels.kbGetChunkCount}`)
    try {
      const count = await kbService.getChunkCount()
      return { success: true, data: count }
    } catch (error) {
      console.error(`[KB Handlers IPC] Error in ${IpcChannels.kbGetChunkCount}:`, error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Handler to get all knowledge base documents from PGlite
  ipcMain.handle(IpcChannels.kbGetAllDocuments, async () => {
    if (!kbService) {
      console.error(
        '[KB Handlers IPC] KnowledgeBaseService instance is not available for kbGetAllDocuments.'
      )
      return { success: false, error: 'KnowledgeBaseService not initialized.', data: [] }
    }
    try {
      const documents = await kbService.getAllKnowledgeBaseDocuments()
      return { success: true, data: documents }
    } catch (error) {
      console.error('[KB Handlers IPC] Error in kbGetAllDocuments:', error)
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.'
      return { success: false, error: errorMessage, data: [] }
    }
  })

  // Handler to delete a knowledge base document from PGlite
  ipcMain.handle(IpcChannels.kbDeleteDocument, async (_event, documentId: string) => {
    if (!kbService) {
      console.error(
        '[KB Handlers IPC] KnowledgeBaseService instance is not available for kbDeleteDocument.'
      )
      return { success: false, error: 'KnowledgeBaseService not initialized.' }
    }
    if (!documentId) {
      console.error('[KB Handlers IPC] kbDeleteDocument: documentId is required.')
      return { success: false, error: 'Document ID is required.' }
    }
    try {
      const deleted = await kbService.deleteKnowledgeBaseDocument(documentId)
      if (deleted) {
        return { success: true }
      } else {
        return { success: false, error: 'Document not found or not deleted.' } // Or more specific error from service if available
      }
    } catch (error) {
      console.error(`[KB Handlers IPC] Error in kbDeleteDocument for ID ${documentId}:`, error)
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.'
      return { success: false, error: errorMessage }
    }
  })

  console.log('[Main Process] KnowledgeBaseService IPC handlers registered.')
}
