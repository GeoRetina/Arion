// Main component export
export { default as KnowledgeBase } from './components/knowledge-base'

// Sub-components exports
export { DocumentsTable } from './components/documents-table'
export { DocumentForm } from './components/document-form'
export { FolderManager } from './components/folder-manager'
export { FolderForm } from './components/folder-form'
export { DeleteConfirmDialog } from './components/delete-confirm-dialog'

// Store exports
export { useKnowledgeBaseStore, type Document, type Folder } from './stores/knowledge-base-store'

// Utilities
export * from './utils/format-utils'
