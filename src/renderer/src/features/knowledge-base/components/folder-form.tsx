import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useKnowledgeBaseStore, Folder } from '../stores/knowledge-base-store'

interface FolderFormProps {
  isOpen: boolean
  onClose: () => void
  folderToEdit?: Folder
}

export function FolderForm({ isOpen, onClose, folderToEdit }: FolderFormProps): React.JSX.Element {
  const { addFolder, updateFolder } = useKnowledgeBaseStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const isEditMode = !!folderToEdit

  useEffect(() => {
    if (folderToEdit) {
      setName(folderToEdit.name)
      setDescription(folderToEdit.description || '')
    } else {
      // Reset form when opening for a new folder
      setName('')
      setDescription('')
    }
  }, [folderToEdit, isOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (isEditMode && folderToEdit) {
      updateFolder(folderToEdit.id, { name, description })
    } else {
      addFolder(name, description)
    }

    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Folder' : 'Create New Folder'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="folder-name" className="text-right">
                Folder Name
              </Label>
              <Input
                id="folder-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="col-span-3"
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="folder-desc" className="text-right">
                Description
              </Label>
              <Textarea
                id="folder-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="col-span-3"
                placeholder="Optional description"
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">{isEditMode ? 'Update' : 'Create'} Folder</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
