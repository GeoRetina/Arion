import React, { useState, useEffect } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  MoreHorizontal,
  Edit,
  Trash,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2
} from 'lucide-react'
import { Document } from '../stores/knowledge-base-store'
import { formatBytes, formatDate } from '../utils/format-utils'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'

interface DocumentsTableProps {
  documents: Document[]
  folders: Record<string, string>
  onEditDocument: (document: Document) => void
  onDeleteDocument: (document: Document) => void
  currentFolderId?: string
  searchQuery: string
  onSearchChange: (query: string) => void
  onAddDocument?: () => void
  showAddDocumentButton?: boolean
  onSelectionChange?: (selectedIds: string[]) => void
  selectedDocumentIds?: string[]
  onBulkDelete?: () => void
}

type SortField = 'name' | 'fileType' | 'fileSize' | 'createdAt' | 'updatedAt'
type SortDirection = 'asc' | 'desc'

export function DocumentsTable({
  documents,
  folders,
  onEditDocument,
  onDeleteDocument,
  currentFolderId,
  searchQuery,
  onSearchChange,
  onAddDocument,
  showAddDocumentButton,
  onSelectionChange,
  selectedDocumentIds: parentSelectedDocumentIds,
  onBulkDelete
}: DocumentsTableProps): React.JSX.Element {
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [currentSelectedDocumentIds, setCurrentSelectedDocumentIds] = useState<string[]>([])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(currentSelectedDocumentIds)
    }
  }, [currentSelectedDocumentIds, onSelectionChange])

  // Filter documents by folder and search query
  const filteredDocuments = documents.filter((doc) => {
    // Filter by folder if specified
    if (currentFolderId && doc.folderId !== currentFolderId) {
      return false
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        doc.name.toLowerCase().includes(query) ||
        (doc.description && doc.description.toLowerCase().includes(query)) ||
        doc.fileType.toLowerCase().includes(query)
      )
    }

    return true
  })

  // Sort documents based on current sort field and direction
  const sortedDocuments = [...filteredDocuments].sort((a, b) => {
    const factor = sortDirection === 'asc' ? 1 : -1

    switch (sortField) {
      case 'name':
        return a.name.localeCompare(b.name) * factor
      case 'fileType':
        return a.fileType.localeCompare(b.fileType) * factor
      case 'fileSize':
        return (a.fileSize - b.fileSize) * factor
      case 'createdAt':
        return (a.createdAt.getTime() - b.createdAt.getTime()) * factor
      case 'updatedAt':
        return (a.updatedAt.getTime() - b.updatedAt.getTime()) * factor
      default:
        return 0
    }
  })

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setCurrentSelectedDocumentIds(sortedDocuments.map((doc) => doc.id))
    } else {
      setCurrentSelectedDocumentIds([])
    }
  }

  const handleSelectRow = (documentId: string, checked: boolean) => {
    if (checked) {
      setCurrentSelectedDocumentIds((prev) => [...prev, documentId])
    } else {
      setCurrentSelectedDocumentIds((prev) => prev.filter((id) => id !== documentId))
    }
  }

  const isAllSelected =
    sortedDocuments.length > 0 && currentSelectedDocumentIds.length === sortedDocuments.length

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? (
      <ChevronUp className="ml-2 h-4 w-4" />
    ) : (
      <ChevronDown className="ml-2 h-4 w-4" />
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center space-x-4 mb-4 shrink-0">
        <div className="flex items-center space-x-4">
          <Input
            type="search"
            placeholder="Search documents..."
            className="max-w-sm border-border"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {showAddDocumentButton && onAddDocument && (
            <Button onClick={onAddDocument}>
              <Plus className="mr-2 h-4 w-4" />
              Add Document
            </Button>
          )}
        </div>
        {parentSelectedDocumentIds && parentSelectedDocumentIds.length > 0 && onBulkDelete && (
          <Button variant="destructive" onClick={onBulkDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete ({parentSelectedDocumentIds.length}) Selected
          </Button>
        )}
      </div>

      <ScrollArea className="flex-grow rounded-md border relative">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                  aria-label="Select all rows"
                  className="translate-y-[2px]"
                />
              </TableHead>
              <TableHead className="w-[30%] cursor-pointer" onClick={() => handleSort('name')}>
                <div className="flex items-center">Name {renderSortIndicator('name')}</div>
              </TableHead>
              {!currentFolderId && <TableHead className="w-[15%]">Folder</TableHead>}
              <TableHead className="w-[15%] cursor-pointer" onClick={() => handleSort('fileType')}>
                <div className="flex items-center">Type {renderSortIndicator('fileType')}</div>
              </TableHead>
              <TableHead className="w-[10%] cursor-pointer" onClick={() => handleSort('fileSize')}>
                <div className="flex items-center">Size {renderSortIndicator('fileSize')}</div>
              </TableHead>
              <TableHead className="w-[15%] cursor-pointer" onClick={() => handleSort('updatedAt')}>
                <div className="flex items-center">Updated {renderSortIndicator('updatedAt')}</div>
              </TableHead>
              <TableHead className="w-[10%] text-right pr-6">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedDocuments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={currentFolderId ? 6 : 7} className="h-24 text-center">
                  No documents found.
                </TableCell>
              </TableRow>
            ) : (
              sortedDocuments.map((document) => (
                <TableRow
                  key={document.id}
                  data-state={currentSelectedDocumentIds.includes(document.id) && 'selected'}
                >
                  <TableCell>
                    <Checkbox
                      checked={currentSelectedDocumentIds.includes(document.id)}
                      onCheckedChange={(checked) =>
                        handleSelectRow(document.id, checked as boolean)
                      }
                      aria-label={`Select row ${document.name}`}
                      className="translate-y-[2px]"
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{document.name}</span>
                      {document.description && (
                        <span className="text-xs text-muted-foreground">
                          {document.description}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  {!currentFolderId && (
                    <TableCell>{document.folderId ? folders[document.folderId] : '-'}</TableCell>
                  )}
                  <TableCell>{document.fileType}</TableCell>
                  <TableCell>{formatBytes(document.fileSize)}</TableCell>
                  <TableCell>{formatDate(document.updatedAt)}</TableCell>
                  <TableCell className="text-right pr-6">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={!document.filePath}
                          onClick={async () => {
                            if (document.filePath) {
                              try {
                                const result = await window.ctg.shell.openPath(document.filePath)
                                if (!result.success) {
                                  // Optionally show a toast or alert to the user here
                                }
                              } catch {
                                // Optionally show a toast or alert to the user here
                              }
                            }
                          }}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          <span>View</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEditDocument(document)}>
                          <Edit className="mr-2 h-4 w-4" />
                          <span>Edit</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDeleteDocument(document)}>
                          <Trash className="mr-2 h-4 w-4" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <ScrollBar orientation="vertical" />
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
