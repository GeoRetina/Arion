import Database, { type Database as DB } from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

// Define types for Chat and Message based on the schema
// These could be moved to a shared types file (e.g., shared/types.ts) later
export interface Chat {
  id: string
  title?: string | null
  created_at: string
  updated_at: string
  metadata?: string | null // JSON string
}

export interface Message {
  id: string
  chat_id: string
  role: 'system' | 'user' | 'assistant' | 'function' | 'data' | 'tool'
  content: string
  name?: string | null
  tool_calls?: string | null // JSON string
  tool_call_id?: string | null
  orchestration?: string | null // JSON string containing orchestration data
  created_at: string
}

const DB_SUBFOLDER = 'database'
const DB_FILENAME = 'arion-app.db'

export class DBService {
  private static instance: DBService
  private db: DB

  private constructor() {
    const dbDir = path.join(app.getPath('userData'), DB_SUBFOLDER)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    const dbPath = path.join(dbDir, DB_FILENAME)

    this.db = new Database(dbPath) // verbose for debugging
    this.initDatabase()
  }

  public static getInstance(): DBService {
    if (!DBService.instance) {
      DBService.instance = new DBService()
    }
    return DBService.instance
  }

  private initDatabase(): void {
    this.db.exec('PRAGMA journal_mode=WAL;')
    this.createTables()
    this.runMigrations()
    // TODO: Load SpatiaLite extension if needed, path to be configured as per Rule 5
    // try {
    //   // const spatialitePath = path.join(app.getAppPath(), 'path/to/mod_spatialite'); // Adjust path
    //   this.db.loadExtension('path/to/mod_spatialite'); // Path needs to be robust
    //
    // } catch (error) {
    //
    //   // Graceful failure as per Rule 5
    // }
  }

  private createTables(): void {
    const createChatsTable = `
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT
      );
    `

    const createMessagesTable = `
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'function', 'data', 'tool')),
        content TEXT NOT NULL,
        name TEXT,
        tool_calls TEXT,
        tool_call_id TEXT,
        orchestration TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      );
    `

    const createChatUpdateTrigger = `
      CREATE TRIGGER IF NOT EXISTS update_chat_timestamp_on_new_message
      AFTER INSERT ON messages
      FOR EACH ROW
      BEGIN
        UPDATE chats
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.chat_id;
      END;
    `

    this.db.transaction(() => {
      this.db.exec(createChatsTable)
      this.db.exec(createMessagesTable)
      this.db.exec(createChatUpdateTrigger)
    })()

    // TODO: Implement a proper migration system (e.g., using Drizzle-kit or custom scripts in src/main/db/migrations/) as per Rule 5 for future schema changes.
    // For now, new tables or alterations can be added here with IF NOT EXISTS or similar checks.
  }

  // --- Chat CRUD Operations ---

  public createChat(
    chatData: Pick<Chat, 'id'> & Partial<Omit<Chat, 'id' | 'created_at' | 'updated_at'>>
  ): Chat | null {
    const { id, title = null, metadata = null } = chatData
    const stmt = this.db.prepare(
      'INSERT INTO chats (id, title, metadata) VALUES (@id, @title, @metadata)'
    )
    try {
      const result = stmt.run({ id, title, metadata })
      if (result.changes > 0) {
        const newChat = this.getChatById(id)
        return newChat
      }
      return null
    } catch (error) {
      const errorCode = (error as { code?: string } | undefined)?.code
      if (errorCode === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        return this.getChatById(id)
      }
      return null
    }
  }

  public getChatById(id: string): Chat | null {
    const stmt = this.db.prepare('SELECT * FROM chats WHERE id = ?')
    const chat = stmt.get(id) as Chat | undefined
    return chat || null
  }

  public getAllChats(
    orderBy: 'created_at' | 'updated_at' = 'updated_at',
    order: 'ASC' | 'DESC' = 'DESC'
  ): Chat[] {
    const validOrderBy = ['created_at', 'updated_at'].includes(orderBy) ? orderBy : 'updated_at'
    const validOrder = ['ASC', 'DESC'].includes(order) ? order : 'DESC'

    const stmt = this.db.prepare(`SELECT * FROM chats ORDER BY ${validOrderBy} ${validOrder}`)
    return stmt.all() as Chat[]
  }

  public updateChat(
    id: string,
    updates: Partial<Omit<Chat, 'id' | 'created_at' | 'updated_at'>>
  ): Chat | null {
    const { title, metadata } = updates

    const currentChat = this.getChatById(id)
    if (!currentChat) return null

    const params: UnsafeAny = { id }
    const setClauses: string[] = []

    if (title !== undefined) {
      setClauses.push('title = @title')
      params.title = title
    }
    if (metadata !== undefined) {
      setClauses.push('metadata = @metadata')
      params.metadata = metadata
    }

    if (setClauses.length === 0) {
      // Only touch updated_at if no other fields are changing
      const touchStmt = this.db.prepare(
        'UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = @id'
      )
      touchStmt.run({ id })
      return this.getChatById(id)
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP')

    const stmt = this.db.prepare(`UPDATE chats SET ${setClauses.join(', ')} WHERE id = @id`)

    try {
      const result = stmt.run(params)
      if (result.changes > 0) {
        return this.getChatById(id)
      }
      return currentChat // Return current if no rows affected (e.g. data was same)
    } catch {
      return null
    }
  }

  public deleteChat(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM chats WHERE id = ?')
    try {
      const result = stmt.run(id)
      return result.changes > 0
    } catch {
      return false
    }
  }

  // Run database migrations to update the schema when needed
  private runMigrations(): void {
    try {
      // Check if orchestration column exists in messages table
      const orchestrationColumnExists = this.db
        .prepare(
          "SELECT COUNT(*) as count FROM pragma_table_info('messages') WHERE name = 'orchestration'"
        )
        .get() as { count: number }

      if (orchestrationColumnExists.count === 0) {
        this.db.prepare('ALTER TABLE messages ADD COLUMN orchestration TEXT').run()
      }
    } catch {
      void 0
    }
  }

  // --- Message CRUD Operations ---

  public addMessage(
    messageData: Pick<Message, 'id' | 'chat_id' | 'role' | 'content'> &
      Partial<Omit<Message, 'id' | 'chat_id' | 'role' | 'content' | 'created_at'>>
  ): Message | null {
    const {
      id,
      chat_id,
      role,
      content,
      name = null,
      tool_calls = null,
      tool_call_id = null,
      orchestration = null
    } = messageData
    const stmt = this.db.prepare(
      'INSERT INTO messages (id, chat_id, role, content, name, tool_calls, tool_call_id, orchestration) VALUES (@id, @chat_id, @role, @content, @name, @tool_calls, @tool_call_id, @orchestration)'
    )
    try {
      const result = stmt.run({
        id,
        chat_id,
        role,
        content,
        name,
        tool_calls,
        tool_call_id,
        orchestration
      })
      if (result.changes > 0) {
        const newMessage = this.getMessageById(id)
        return newMessage
      }
      return null
    } catch {
      return null
    }
  }

  public getMessageById(id: string): Message | null {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE id = ?')
    const message = stmt.get(id) as Message | undefined
    return message || null
  }

  public getMessagesByChatId(
    chat_id: string,
    orderBy: 'created_at' = 'created_at',
    order: 'ASC' | 'DESC' = 'ASC'
  ): Message[] {
    const validOrderBy = ['created_at'].includes(orderBy) ? orderBy : 'created_at' // Ensure valid column
    const validOrder = ['ASC', 'DESC'].includes(order) ? order : 'ASC' // Ensure valid order

    const stmt = this.db.prepare(
      `SELECT * FROM messages WHERE chat_id = ? ORDER BY ${validOrderBy} ${validOrder}`
    )
    return stmt.all(chat_id) as Message[]
  }

  public deleteMessage(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM messages WHERE id = ?')
    try {
      const result = stmt.run(id)
      return result.changes > 0
    } catch {
      return false
    }
  }

  // Consider adding updateMessage if use cases arise, though messages are often immutable.

  public close(): void {
    if (this.db && this.db.open) {
      this.db.close()
    }
  }

  // --- Removed Knowledge Base Document CRUD Operations ---
  // These are now handled by KnowledgeBaseService with PGlite

  // public addKnowledgeBaseDocument(...) { ... }
  // public getKnowledgeBaseDocumentById(...) { ... }
  // public getAllKnowledgeBaseDocuments(...) { ... }
  // public updateKnowledgeBaseDocument(...) { ... }
  // public deleteKnowledgeBaseDocument(...) { ... }
}

// Initialize and export a singleton instance
// This ensures that only one instance of DBService is created and used throughout the main process.
export const dbService = DBService.getInstance()

// Graceful shutdown: Ensure DB connection is closed when the app quits.
// This should be registered in your main Electron process file (e.g., src/main/index.ts)
// if not already handled by Electron's default behavior with app.getPath('userData').
// However, better-sqlite3 connections are typically robust. Explicit close is good practice.
app.on('before-quit', () => {
  // DBService.getInstance().close(); // Using the exported instance is cleaner
  dbService.close()
})
