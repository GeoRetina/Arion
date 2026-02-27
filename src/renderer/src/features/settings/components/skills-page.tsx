import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, RefreshCw, Loader2, Boxes, Edit, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { SkillPackInfo } from '@/../../shared/ipc-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'

const sourceColorMap: Record<string, string> = {
  workspace: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  managed: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  global: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  bundled: 'bg-green-500/10 text-green-600 border-green-500/20'
}

const SkillsPage: React.FC = () => {
  const [availableSkills, setAvailableSkills] = useState<SkillPackInfo[]>([])
  const [isSkillsLoading, setIsSkillsLoading] = useState(true)
  const [isUploadingSkill, setIsUploadingSkill] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isEditSkillLoading, setIsEditSkillLoading] = useState(false)
  const [isSavingSkill, setIsSavingSkill] = useState(false)
  const [editingSkill, setEditingSkill] = useState<SkillPackInfo | null>(null)
  const [editedSkillContent, setEditedSkillContent] = useState('')
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeletingSkill, setIsDeletingSkill] = useState(false)
  const [skillToDelete, setSkillToDelete] = useState<SkillPackInfo | null>(null)
  const skillUploadInputRef = useRef<HTMLInputElement | null>(null)

  const getSkillContentCompat = async (skill: SkillPackInfo): Promise<string> => {
    const settingsApi = window.ctg.settings as unknown as {
      getSkillContent?: (target: {
        id: string
        source: SkillPackInfo['source']
        sourcePath: string
      }) => Promise<{ content: string }>
      getManagedSkillContent?: (skillId: string) => Promise<{ content: string }>
    }

    if (typeof settingsApi.getSkillContent === 'function') {
      const result = await settingsApi.getSkillContent({
        id: skill.id,
        source: skill.source,
        sourcePath: skill.sourcePath
      })
      return result.content
    }

    if (skill.source === 'managed' && typeof settingsApi.getManagedSkillContent === 'function') {
      const result = await settingsApi.getManagedSkillContent(skill.id)
      return result.content
    }

    throw new Error('Skill editing for this source requires restarting Arion to refresh the preload bridge.')
  }

  const updateSkillCompat = async (skill: SkillPackInfo, content: string): Promise<string> => {
    const settingsApi = window.ctg.settings as unknown as {
      updateSkill?: (payload: {
        id: string
        source: SkillPackInfo['source']
        sourcePath: string
        content: string
      }) => Promise<{ id: string }>
      updateManagedSkill?: (payload: { id: string; content: string }) => Promise<{ id: string }>
    }

    if (typeof settingsApi.updateSkill === 'function') {
      const result = await settingsApi.updateSkill({
        id: skill.id,
        source: skill.source,
        sourcePath: skill.sourcePath,
        content
      })
      return result.id
    }

    if (skill.source === 'managed' && typeof settingsApi.updateManagedSkill === 'function') {
      const result = await settingsApi.updateManagedSkill({
        id: skill.id,
        content
      })
      return result.id
    }

    throw new Error('Skill editing for this source requires restarting Arion to refresh the preload bridge.')
  }

  const deleteSkillCompat = async (skill: SkillPackInfo): Promise<{ id: string; deleted: boolean }> => {
    const settingsApi = window.ctg.settings as unknown as {
      deleteSkill?: (target: {
        id: string
        source: SkillPackInfo['source']
        sourcePath: string
      }) => Promise<{ id: string; deleted: boolean }>
      deleteManagedSkill?: (skillId: string) => Promise<{ id: string; deleted: boolean }>
    }

    if (typeof settingsApi.deleteSkill === 'function') {
      return settingsApi.deleteSkill({
        id: skill.id,
        source: skill.source,
        sourcePath: skill.sourcePath
      })
    }

    if (skill.source === 'managed' && typeof settingsApi.deleteManagedSkill === 'function') {
      return settingsApi.deleteManagedSkill(skill.id)
    }

    throw new Error('Skill deletion for this source requires restarting Arion to refresh the preload bridge.')
  }

  const fetchSkills = useCallback(async (): Promise<void> => {
    const skills = await window.ctg.settings.listAvailableSkills()
    setAvailableSkills(skills)
  }, [])

  useEffect(() => {
    const fetchSkillPackState = async (): Promise<void> => {
      setIsSkillsLoading(true)
      try {
        await fetchSkills()
      } catch {
        setAvailableSkills([])
      } finally {
        setIsSkillsLoading(false)
      }
    }

    void fetchSkillPackState()
  }, [fetchSkills])

  const handleRefreshSkills = async (): Promise<void> => {
    setIsSkillsLoading(true)
    try {
      await fetchSkills()
      toast.success('Skills refreshed')
    } catch (error) {
      toast.error('Failed to refresh skills', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    } finally {
      setIsSkillsLoading(false)
    }
  }

  const handleUploadClick = (): void => {
    skillUploadInputRef.current?.click()
  }

  const handleUploadSkill = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const selectedFile = event.target.files?.[0]
    event.target.value = ''

    if (!selectedFile) {
      return
    }

    setIsUploadingSkill(true)
    try {
      const uploadedContent = await selectedFile.text()
      const result = await window.ctg.settings.uploadManagedSkill({
        fileName: selectedFile.name,
        content: uploadedContent
      })

      await fetchSkills()

      toast.success(`Skill $${result.id} uploaded`, {
        description: result.overwritten
          ? 'An existing managed skill with the same id was replaced.'
          : undefined
      })
    } catch (error) {
      toast.error('Failed to upload skill', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    } finally {
      setIsUploadingSkill(false)
    }
  }

  const handleEditSkill = async (skill: SkillPackInfo): Promise<void> => {
    setEditingSkill(skill)
    setEditedSkillContent('')
    setIsEditDialogOpen(true)
    setIsEditSkillLoading(true)

    try {
      const content = await getSkillContentCompat(skill)
      setEditedSkillContent(content)
    } catch (error) {
      setEditingSkill(null)
      setIsEditDialogOpen(false)
      toast.error('Failed to open skill editor', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    } finally {
      setIsEditSkillLoading(false)
    }
  }

  const handleSaveEditedSkill = async (): Promise<void> => {
    if (!editingSkill) {
      return
    }

    if (!editedSkillContent.trim()) {
      toast.error('Skill content is required')
      return
    }

    setIsSavingSkill(true)
    try {
      const updatedId = await updateSkillCompat(editingSkill, editedSkillContent)
      await fetchSkills()
      toast.success(`Skill $${updatedId} updated`)
      setIsEditDialogOpen(false)
      setEditingSkill(null)
      setEditedSkillContent('')
    } catch (error) {
      toast.error('Failed to save skill', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    } finally {
      setIsSavingSkill(false)
    }
  }

  const handleDeleteClick = (skill: SkillPackInfo): void => {
    setSkillToDelete(skill)
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteSkill = async (): Promise<void> => {
    if (!skillToDelete) {
      return
    }

    setIsDeletingSkill(true)
    try {
      const result = await deleteSkillCompat(skillToDelete)
      if (!result.deleted) {
        throw new Error(`Skill "${skillToDelete.id}" was not found`)
      }
      await fetchSkills()
      toast.success(`Skill $${result.id} deleted`)
      setSkillToDelete(null)
    } catch (error) {
      toast.error('Failed to delete skill', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    } finally {
      setIsDeletingSkill(false)
    }
  }

  const handleEditDialogOpenChange = (open: boolean): void => {
    setIsEditDialogOpen(open)
    if (!open) {
      setEditingSkill(null)
      setEditedSkillContent('')
      setIsEditSkillLoading(false)
    }
  }

  const handleDeleteDialogOpenChange = (open: boolean): void => {
    setIsDeleteDialogOpen(open)
    if (!open) {
      setSkillToDelete(null)
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-8 px-4 md:px-6">
        <div className="flex flex-col items-start gap-6">
          {/* Header */}
          <div className="w-full">
            <h1 className="text-3xl font-semibold mb-2">Skills</h1>
            <p className="text-muted-foreground max-w-2xl">
              Manage skill packs that extend Arion&apos;s capabilities. Skills are resolved from
              managed, workspace, global, and bundled sources.
            </p>
          </div>

          {/* Actions toolbar */}
          <div className="flex items-center gap-3 w-full">
            <h2 className="text-xl font-semibold">
              Resolved Skills{' '}
              {!isSkillsLoading && (
                <span className="text-muted-foreground font-normal">
                  ({availableSkills.length})
                </span>
              )}
            </h2>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={handleUploadClick} disabled={isUploadingSkill}>
                <Upload className="h-4 w-4 mr-2" />
                {isUploadingSkill ? 'Uploading...' : 'Upload Skill'}
              </Button>
              <Button variant="outline" onClick={handleRefreshSkills} disabled={isSkillsLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isSkillsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          <Input
            ref={skillUploadInputRef}
            type="file"
            accept=".md,text/markdown"
            className="hidden"
            onChange={handleUploadSkill}
          />

          {/* Skills Grid */}
          {isSkillsLoading ? (
            <div className="w-full flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : availableSkills.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">
              {availableSkills.map((skill) => (
                <Card
                  key={`${skill.id}:${skill.source}`}
                  className="flex flex-col overflow-hidden transition-all hover:shadow-md"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{skill.name}</CardTitle>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-xs ${sourceColorMap[skill.source] || ''}`}
                      >
                        {skill.source}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs font-mono">{`$${skill.id}`}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 grow">
                    <p className="text-sm text-muted-foreground">{skill.description}</p>
                    <p className="text-xs text-muted-foreground/70 mt-3 break-all">
                      {skill.sourcePath}
                    </p>
                    <div className="mt-4 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleEditSkill(skill)}
                        disabled={isDeletingSkill || isUploadingSkill || isSavingSkill}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
                        onClick={() => handleDeleteClick(skill)}
                        disabled={isDeletingSkill || isUploadingSkill || isSavingSkill}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="w-full text-center py-12 border border-dashed rounded-lg">
              <Boxes className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground mb-1">No skills found</p>
              <p className="text-sm text-muted-foreground">Upload a skill to get started.</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={handleEditDialogOpenChange}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {editingSkill ? `Edit Skill $${editingSkill.id}` : 'Edit Skill'}
            </DialogTitle>
          </DialogHeader>

          {isEditSkillLoading ? (
            <div className="w-full flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-3">
              <Textarea
                value={editedSkillContent}
                onChange={(event) => setEditedSkillContent(event.target.value)}
                className="min-h-[420px] resize-y font-mono text-xs"
                placeholder="Skill markdown content"
                disabled={isSavingSkill}
              />
              <p className="text-xs text-muted-foreground">
                Skill ID is fixed. Keep the frontmatter id aligned with $
                {editingSkill?.id || 'skill-id'}.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleEditDialogOpenChange(false)}
              disabled={isSavingSkill}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleSaveEditedSkill()}
              disabled={isEditSkillLoading || isSavingSkill}
            >
              {isSavingSkill ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={handleDeleteDialogOpenChange}
        title="Delete Skill"
        description={`Delete $${skillToDelete?.id || ''}? This action cannot be undone.`}
        confirmText={isDeletingSkill ? 'Deleting...' : 'Delete'}
        onConfirm={handleDeleteSkill}
        variant="destructive"
      />
    </ScrollArea>
  )
}

export default SkillsPage
