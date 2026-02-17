import React, { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Upload } from 'lucide-react'
import { useKnowledgeBaseStore, Document } from '../stores/knowledge-base-store'
import { nanoid } from 'nanoid'
// import { useToast } from '@/components/ui/toast' // Assuming this is the correct path for shadcn/ui toast - COMMENTED OUT
import { toast } from 'sonner'
import type { KBAddDocumentPayload } from '../../../../../shared/ipc-types'

interface DocumentFormProps {
  isOpen: boolean
  onClose: () => void
  documentToEdit?: Document
}

export function DocumentForm({
  isOpen,
  onClose,
  documentToEdit
}: DocumentFormProps): React.JSX.Element {
  const { folders, addDocument: addDocumentToStore, updateDocument } = useKnowledgeBaseStore()
  // const { toast } = useToast() // COMMENTED OUT
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    folderId: '',
    filePath: '',
    fileType: '',
    fileSize: 0
  })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null) // New state for file content
  const isEditMode = !!documentToEdit

  useEffect(() => {
    if (documentToEdit) {
      setFormData({
        name: documentToEdit.name,
        description: documentToEdit.description || '',
        folderId: documentToEdit.folderId || '',
        filePath: documentToEdit.filePath || '',
        fileType: documentToEdit.fileType,
        fileSize: documentToEdit.fileSize
      })
    } else {
      setFormData({
        name: '',
        description: '',
        folderId: '',
        filePath: '',
        fileType: '',
        fileSize: 0
      })
      setSelectedFile(null)
      setFileBuffer(null) // Reset file buffer
    }
    setIsProcessing(false)
  }, [documentToEdit, isOpen])

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleFolderChange = (value: string): void => {
    setFormData((prev) => ({
      ...prev,
      folderId: value === 'none' ? '' : value
    }))
  }

  const processFile = async (file: File): Promise<void> => {
    setSelectedFile(file)
    setFileBuffer(null) // Reset previous buffer

    setFormData((prev) => ({
      ...prev,
      name: prev.name || file.name.split('.').slice(0, -1).join('.') || file.name,
      filePath: file.path, // Keep trying to get file.path
      fileType: file.type,
      fileSize: file.size
    }))

    if (!file.path) {
      try {
        const buffer = await file.arrayBuffer()
        setFileBuffer(buffer)
      } catch {
        toast.error('Error Reading File', {
          description: 'Could not read the file content. Please try again.'
        })
        setSelectedFile(null) // Clear selected file as we can't process it
        return // Stop processing this file
      }
    }

    if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      void 0
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      void 0
    } else if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.endsWith('.docx')
    ) {
      void 0
    } else {
      void 0
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      processFile(files[0])
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setIsProcessing(true)

    if (!formData.name) {
      toast.error('Name Required', { description: 'Please enter a name for the document.' })
      setIsProcessing(false)
      return
    }

    if (isEditMode && documentToEdit) {
      updateDocument(documentToEdit.id, {
        name: formData.name,
        description: formData.description,
        folderId: formData.folderId || undefined,
        filePath: formData.filePath,
        fileType: formData.fileType,
        fileSize: formData.fileSize
      })
      toast.success('Document Updated', {
        description: `"${formData.name}" metadata has been updated.`
      })
      setIsProcessing(false)
      onClose()
    } else {
      if (!selectedFile) {
        toast.error('File Required', { description: 'Please select a document file to add.' })
        setIsProcessing(false)
        return
      }

      const documentIdForBackend = nanoid()
      const actualFilePath = selectedFile?.path

      if (!actualFilePath && !fileBuffer) {
        toast.error('File Error', {
          description: 'Could not get file path or read file content. Please try again.'
        })
        setIsProcessing(false)
        return
      }

      if (window.ctg?.knowledgeBase?.addDocument) {
        try {
          const payload: KBAddDocumentPayload = {
            documentId: documentIdForBackend,
            fileType: selectedFile.type,
            originalName: formData.name,
            fileSize: selectedFile.size,
            folderId: formData.folderId || undefined,
            description: formData.description || undefined,
            ...(actualFilePath && { filePath: actualFilePath }),
            ...(fileBuffer && { fileBuffer: fileBuffer })
          }

          const result = await window.ctg.knowledgeBase.addDocument(payload)

          if (result.success && result.documentId && result.document) {
            toast.success('Document Processed Successfully', {
              description: `"${formData.name}" (ID: ${result.documentId}) has been added to the Knowledge Base.`
            })
            addDocumentToStore(result.document)
            onClose()
          } else {
            const errorMessage =
              result.error || 'Failed to process and add document to the Knowledge Base backend.'
            toast.error('Document Processing Failed', {
              description: `Could not add "${formData.name}" to RAG: ${errorMessage}`
            })
          }
        } catch (error) {
          toast.error('IPC Communication Error', {
            description: `Error communicating with backend to process "${formData.name}": ${(error as Error).message}`
          })
        } finally {
          setIsProcessing(false)
          onClose()
        }
      } else {
        toast.error('Knowledge Base API Error', {
          description: 'The API for adding documents to the knowledge base is not available.'
        })
        setIsProcessing(false)
        onClose()
      }
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={() => {
        if (!isProcessing) onClose()
      }}
    >
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Document' : 'Add New Document'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update the document details below.'
              : 'Fill in the details to add a new document. Plain text (.txt, .md) files will be added to the RAG Knowledge Base.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="col-span-3"
                required
                disabled={isProcessing}
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                Description
              </Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                className="col-span-3"
                disabled={isProcessing}
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="folder" className="text-right">
                Folder
              </Label>
              <Select
                value={formData.folderId || 'none'}
                onValueChange={handleFolderChange}
                disabled={isProcessing}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a folder (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isEditMode && (
              <div className="grid grid-cols-1 items-center gap-2 mt-4">
                <Label htmlFor="file-upload-area">Document File</Label>
                <div
                  id="file-upload-area"
                  className={`border-2 border-dashed rounded-md p-6 text-center transition-colors ${
                    isDragging
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                  } ${isProcessing ? 'cursor-not-allowed opacity-50' : ''}`}
                  onDragOver={!isProcessing ? handleDragOver : undefined}
                  onDragLeave={!isProcessing ? handleDragLeave : undefined}
                  onDrop={!isProcessing ? handleDrop : undefined}
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {selectedFile
                      ? `Selected: ${selectedFile.name}`
                      : 'Drag & drop .txt or .md file here or click to browse'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedFile
                      ? `Type: ${selectedFile.type || 'Unknown'} • Size: ${(selectedFile.size / 1024).toFixed(2)} KB`
                      : 'Plain text (.txt, .md) files will be added to RAG Knowledge Base.'}
                  </p>
                  <Input
                    id="file"
                    type="file"
                    accept=".txt,.md,text/plain,application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={isProcessing}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2"
                    onClick={() => !isProcessing && document.getElementById('file')?.click()}
                    disabled={isProcessing}
                  >
                    Browse File
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isProcessing}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isProcessing || (!isEditMode && !selectedFile)}>
              {isProcessing ? 'Processing...' : isEditMode ? 'Save Changes' : 'Add Document'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
