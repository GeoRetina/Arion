import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite/vector'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { embedMany, embed, type EmbeddingModel, type EmbedResult } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { SettingsService } from './settings-service'
import { nanoid } from 'nanoid'
import { EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_MODEL_ID } from '../constants/llm-constants'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import type { KBAddDocumentPayload, KnowledgeBaseDocumentForClient } from '../../shared/ipc-types'

const KB_DB_SUBFOLDER = 'knowledgebase_db'
const KB_DB_FILENAME = 'arion-kb.db'

export interface KBRecord {
  id: string // Unique ID for the chunk
  document_id: string // Foreign key to an original document (if we store document metadata separately)
  content: string // The text chunk
  embedding: number[] // The vector embedding
  created_at: string
  // Potentially other metadata like source_filename, page_number, etc.
}

export class KnowledgeBaseService {
  private db: PGlite | undefined
  private dbPath: string
  private settingsService: SettingsService
  private embeddingModel: EmbeddingModel | undefined

  constructor(settingsService: SettingsService) {
    const dbDir = path.join(app.getPath('userData'), KB_DB_SUBFOLDER)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    this.dbPath = path.join(dbDir, KB_DB_FILENAME)
    this.settingsService = settingsService
  }

  public async initialize(): Promise<void> {
    if (this.db) {
      return
    }

    try {
      if (!this.dbPath) {
        throw new Error('Database path is not set before initialization.')
      }

      this.db = new PGlite(this.dbPath, {
        extensions: {
          vector
        }
      })

      await this.db.waitReady

      await this.initSchema()
      await this.initializeEmbeddingModel()
    } catch (error) {
      this.db = undefined
      this.embeddingModel = undefined
      throw error
    }
  }

  private async initSchema(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.')
    }

    try {
      // Enable pgvector extension
      await this.db.query('CREATE EXTENSION IF NOT EXISTS vector;')

      // Add a log to confirm the dimensions being used for table creation

      // Create a table for document chunks and their embeddings
      // This table will store individual text chunks and their vector embeddings.
      // We can add a separate table for overall document metadata later if needed.
      const createChunksTableQuery = `
        CREATE TABLE IF NOT EXISTS document_chunks (
          id TEXT PRIMARY KEY,
          document_id TEXT, -- Could be a path, a UUID for a group of chunks, etc.
          content TEXT NOT NULL,
          embedding vector(${EMBEDDING_DIMENSIONS}) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `
      await this.db.query(createChunksTableQuery)

      // Create a table for document metadata
      const createDocumentsTableQuery = `
        CREATE TABLE IF NOT EXISTS kb_documents (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          original_file_name TEXT NOT NULL,
          file_path TEXT,
          file_type TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          folder_id TEXT,          -- Nullable, for now, folder metadata might be elsewhere
          description TEXT,
          chunk_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `
      await this.db.query(createDocumentsTableQuery)

      // Re-create document_chunks with a proper foreign key if it exists from an older schema without it.
      // This is a bit heavy-handed for a migration, but ensures the FK for this dev phase.
      // A more robust migration strategy would be needed for production data.
      await this.db.query('DROP TABLE IF EXISTS document_chunks;')
      const createChunksTableWithFKQuery = `
        CREATE TABLE document_chunks (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          embedding vector(${EMBEDDING_DIMENSIONS}) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `
      await this.db.query(createChunksTableWithFKQuery)

      // Create an HNSW index on the embedding column for faster similarity search
      // Using cosine distance as it's common for sentence embeddings.
      // Adjust parameters (m, ef_construction) based on dataset size and performance needs.
      const createIndexQuery = `
        CREATE INDEX IF NOT EXISTS idx_hnsw_embedding_cosine
        ON document_chunks
        USING hnsw (embedding vector_cosine_ops);
      `
      // Note: PGlite might have specific syntax or support levels for HNSW index parameters.
      // For now, using a basic HNSW index creation. Advanced parameters might require checking PGlite docs.
      await this.db.query(createIndexQuery)
    } catch (error) {
      throw error
    }
  }

  private async initializeEmbeddingModel(): Promise<void> {
    try {
      const openaiConfig = await this.settingsService.getOpenAIConfig()
      if (!openaiConfig?.apiKey) {
        this.embeddingModel = undefined
        return
      }
      // const embeddingModelId = 'text-embedding-ada-002' // MOVED to llm.constants.ts
      const openai = createOpenAI({ apiKey: openaiConfig.apiKey })
      this.embeddingModel = openai.embedding(DEFAULT_EMBEDDING_MODEL_ID)
    } catch (error) {
      this.embeddingModel = undefined
    }
  }

  // A simple chunking function (can be improved with more sophisticated libraries)
  private generateChunks(input: string, chunkSize: number = 500, overlap: number = 50): string[] {
    const chunks: string[] = []
    if (!input || input.trim().length === 0) return chunks

    let i = 0
    while (i < input.length) {
      const end = Math.min(i + chunkSize, input.length)
      chunks.push(input.substring(i, end))
      i += chunkSize - overlap
      if (i >= input.length && end < input.length) {
        // Captured last chunk already
        break
      }
      if (i < chunkSize - overlap && end === input.length) {
        // Input shorter than one chunk cycle
        break
      }
    }
    return chunks.map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 0)
  }

  public async addDocument(documentContent: string, documentId: string): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized.')
    }
    if (!this.embeddingModel) {
      await this.initializeEmbeddingModel()
      if (!this.embeddingModel) {
        throw new Error('Embedding model is not available. Check OpenAI configuration.')
      }
    }

    const chunks = this.generateChunks(documentContent)
    if (chunks.length === 0) {
      return 0
    }

    try {
      const { embeddings } = await embedMany({
        model: this.embeddingModel,
        values: chunks
      })

      if (embeddings.length !== chunks.length) {
        throw new Error('Embedding generation failed: counts mismatch.')
      }

      // Use standard SQL transactions with PGlite
      await this.db.query('BEGIN;')
      try {
        for (let i = 0; i < chunks.length; i++) {
          const chunkId = nanoid()
          const chunkText = chunks[i]
          const embeddingVector = embeddings[i]
          const embeddingString = JSON.stringify(embeddingVector)
          await this.db.query(
            'INSERT INTO document_chunks (id, document_id, content, embedding) VALUES ($1, $2, $3, $4::vector)',
            [chunkId, documentId, chunkText, embeddingString]
          )
        }
        await this.db.query('COMMIT;')
        return chunks.length
      } catch (txError) {
        await this.db.query('ROLLBACK;')
        throw txError
      }
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          (error.message.includes('Transaction error') || error.message.includes('ROLLBACK'))
        )
      ) {
        throw error
      }
      return 0
    }
  }

  private async extractTextFromFile(payload: {
    filePath?: string
    fileType: string
    fileBuffer?: ArrayBuffer
  }): Promise<string> {
    const { filePath, fileType, fileBuffer } = payload
    let rawText = ''
    let nodeBuffer: Buffer // Explicitly type as Node.js Buffer

    if (!filePath && !fileBuffer) {
      throw new Error('Either filePath or fileBuffer must be provided to extract text.')
    }

    if (fileBuffer) {
      nodeBuffer = Buffer.from(fileBuffer) // Convert ArrayBuffer to Node.js Buffer
    } else {
      nodeBuffer = fs.readFileSync(filePath!) // Read file path into Node.js Buffer
    }

    if (fileType === 'application/pdf') {
      const data = await pdfParse(nodeBuffer) // pdf-parse can handle Node.js Buffer
      rawText = data.text.text
    } else if (
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileType === 'application/msword'
    ) {
      const result = await mammoth.extractRawText({ buffer: nodeBuffer })
      rawText = result.value
    } else if (fileType === 'text/plain' || fileType.startsWith('text/')) {
      rawText = nodeBuffer.toString('utf8')
    } else {
      throw new Error(`Unsupported file type: ${fileType}`)
    }
    return rawText
  }

  /**
   * Adds a document to the knowledge base from a file path or buffer.
   * It extracts text, chunks it, generates embeddings, and stores them.
   * @param payload - Object containing document ID, file type, original name, and either filePath or fileBuffer.
   */
  public async addDocumentFromFile(
    payload: KBAddDocumentPayload
  ): Promise<KnowledgeBaseDocumentForClient> {
    const { documentId, fileType, originalName, fileBuffer, fileSize, folderId, description } =
      payload

    let filePathToStore: string | null = payload.filePath || null
    const localPayloadFilePath = payload.filePath // Keep a copy of original payload.filePath for extractTextFromFile

    if (!this.db) {
      throw new Error('[KnowledgeBaseService] Database not initialized.')
    }
    if (!this.embeddingModel) {
      await this.initializeEmbeddingModel()
      if (!this.embeddingModel) {
        throw new Error(
          '[KnowledgeBaseService] Embedding model not initialized and failed to re-initialize.'
        )
      }
    }

    // If filePath is not provided but buffer is, save the buffer to a local cache and use that path
    if (!filePathToStore && fileBuffer) {
      const KNOWLEDGE_BASE_FILES_DIR = path.join(app.getPath('userData'), 'kb_document_files')
      if (!fs.existsSync(KNOWLEDGE_BASE_FILES_DIR)) {
        fs.mkdirSync(KNOWLEDGE_BASE_FILES_DIR, { recursive: true })
      }
      // Sanitize originalName for use in file path, or use documentId for uniqueness
      const safeFileName = originalName.replace(/[^a-zA-Z0-9_.-]/g, '_')
      const cachedFilePath = path.join(KNOWLEDGE_BASE_FILES_DIR, `${documentId}_${safeFileName}`)

      try {
        fs.writeFileSync(cachedFilePath, Buffer.from(fileBuffer)) // Convert ArrayBuffer to Node.js Buffer
        filePathToStore = cachedFilePath
      } catch (writeError) {
        filePathToStore = null // Fallback if saving fails, though this means 'View' won't work.
      }
    }

    const documentContent = await this.extractTextFromFile({
      filePath: localPayloadFilePath, // Use original filePath for extraction if present
      fileType,
      fileBuffer
    })
    if (!documentContent) {
      throw new Error('No content extracted from file.')
    }

    const chunks = this.generateChunks(documentContent)
    if (chunks.length === 0) {
      throw new Error('No chunks generated from document content.')
    }

    const now = new Date()
    const createdAtISO = now.toISOString()
    const updatedAtISO = now.toISOString() // Initially, created and updated are the same

    try {
      await this.db.query('BEGIN;') // Start transaction

      // 1. Insert metadata into kb_documents
      const insertDocMetaQuery = `
        INSERT INTO kb_documents (
          id, name, original_file_name, file_path, file_type, file_size,
          folder_id, description, chunk_count, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
      `
      await this.db.query(insertDocMetaQuery, [
        documentId,
        originalName, // Using originalName as the default name
        originalName,
        filePathToStore, // Use the potentially cached path
        fileType,
        fileSize || 0,
        folderId,
        description,
        chunks.length, // chunk_count
        createdAtISO,
        updatedAtISO
      ])

      // 2. Generate embeddings and insert chunks
      const { embeddings } = await embedMany({
        model: this.embeddingModel,
        values: chunks
      })

      if (embeddings.length !== chunks.length) {
        await this.db.query('ROLLBACK;') // Rollback on error
        throw new Error('Embedding generation failed: counts mismatch.')
      }

      for (let i = 0; i < chunks.length; i++) {
        const chunkId = nanoid()
        const chunkText = chunks[i]
        const embeddingVector = embeddings[i]
        const embeddingString = JSON.stringify(embeddingVector)
        await this.db.query(
          'INSERT INTO document_chunks (id, document_id, content, embedding, created_at) VALUES ($1, $2, $3, $4::vector, $5)',
          [chunkId, documentId, chunkText, embeddingString, createdAtISO] // Use same createdAt for chunks
        )
      }

      await this.db.query('COMMIT;') // Commit transaction

      // Construct and return the client document object from the committed data
      const documentForClient: KnowledgeBaseDocumentForClient = {
        id: documentId,
        name: originalName,
        original_file_name: originalName,
        filePath: filePathToStore, // Use the potentially cached path
        file_type: fileType,
        file_size: fileSize || 0,
        folder_id: folderId,
        description: description,
        chunk_count: chunks.length,
        created_at: createdAtISO,
        updated_at: updatedAtISO
      }
      return documentForClient
    } catch (error) {
      // Attempt to rollback if an error occurred mid-transaction
      // Note: Some errors (like db connection issues) might prevent rollback query from executing.
      try {
        await this.db.query('ROLLBACK;')
      } catch (rollbackError) {}
      throw error // Re-throw the original error
    }
  }

  // New public method to embed a single text string
  public async embedText(text: string): Promise<number[]> {
    if (!this.embeddingModel) {
      await this.initializeEmbeddingModel()
      if (!this.embeddingModel) {
        throw new Error('Embedding model is not available. Check OpenAI configuration.')
      }
    }
    try {
      const { embedding }: EmbedResult = await embed({
        model: this.embeddingModel,
        value: text
      })
      return embedding
    } catch (error) {
      throw error
    }
  }

  public async findSimilarChunks(queryEmbedding: number[], limit: number = 5): Promise<KBRecord[]> {
    if (!this.db) {
      throw new Error('Database not initialized.')
    }

    const queryEmbeddingString = JSON.stringify(queryEmbedding)
    const query = `
      SELECT id, document_id, content, created_at, embedding::text AS embedding_text
      FROM document_chunks
      ORDER BY embedding <-> $1::vector
      LIMIT $2;
    `

    try {
      const result = await this.db.query<{
        id: string
        document_id: string
        content: string
        created_at: string
        embedding_text: string
      }>(query, [queryEmbeddingString, limit])

      if (result.rows && Array.isArray(result.rows)) {
        return result.rows.map((row) => ({
          id: row.id,
          document_id: row.document_id,
          content: row.content,
          created_at: row.created_at,
          embedding: JSON.parse(row.embedding_text)
        }))
      }
      return []
    } catch (error) {
      throw error
    }
  }

  public async getChunkCount(): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.')
    }
    try {
      const result = await this.db.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM document_chunks;'
      )
      if (result.rows && result.rows.length > 0 && result.rows[0]) {
        return parseInt(result.rows[0].count, 10) || 0
      }
      return 0
    } catch (error) {
      return 0
    }
  }

  public async close(): Promise<void> {
    if (this.db) {
      this.db = undefined
    }
  }

  public async getAllKnowledgeBaseDocuments(): Promise<KnowledgeBaseDocumentForClient[]> {
    if (!this.db) {
      return []
    }
    try {
      const result = await this.db.query<
        Omit<KnowledgeBaseDocumentForClient, 'filePath'> & { file_path: string | null }
      >(
        'SELECT id, name, original_file_name, file_path, file_type, file_size, folder_id, description, chunk_count, created_at, updated_at FROM kb_documents ORDER BY name ASC;'
      ) // Query actual column names, map to camelCase below
      return (
        result.rows?.map((row) => ({
          id: row.id,
          name: row.name,
          original_file_name: row.original_file_name,
          filePath: row.file_path || null,
          file_type: row.file_type,
          file_size: row.file_size,
          folder_id: row.folder_id || undefined,
          description: row.description || undefined,
          chunk_count: row.chunk_count || 0,
          created_at: row.created_at,
          updated_at: row.updated_at
        })) || []
      )
    } catch (error) {
      return []
    }
  }

  public async deleteKnowledgeBaseDocument(documentId: string): Promise<boolean> {
    if (!this.db) {
      return false
    }
    try {
      // First, retrieve the document to get its file_path
      const docResult = await this.db.query<{ file_path: string | null }>( // Specify type for file_path
        'SELECT file_path FROM kb_documents WHERE id = $1',
        [documentId]
      )
      const docToDelete = docResult.rows && docResult.rows[0]
      const filePathToDelete = docToDelete?.file_path

      // Now, delete the document record from the database (chunks will be deleted by CASCADE)
      const deleteDbResult = await this.db.query('DELETE FROM kb_documents WHERE id = $1', [
        documentId
      ])
      const affectedRows = deleteDbResult.affectedRows || 0

      // If a file path exists and it seems to be a cached file, attempt to delete it
      if (filePathToDelete) {
        const KNOWLEDGE_BASE_FILES_DIR = path.join(app.getPath('userData'), 'kb_document_files')
        // Check if the path is within our designated cache directory to avoid deleting other files
        if (filePathToDelete.startsWith(KNOWLEDGE_BASE_FILES_DIR)) {
          try {
            if (fs.existsSync(filePathToDelete)) {
              fs.unlinkSync(filePathToDelete)
            } else {
            }
          } catch (fileDeleteError) {
            // Do not re-throw or return false for this; DB deletion was the primary goal.
            // Log the error and continue.
          }
        } else {
        }
      }

      return affectedRows > 0
    } catch (error) {
      throw error
    }
  }
}
