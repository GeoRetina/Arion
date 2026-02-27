import React from 'react'
import type { SkillPackInfo } from '@/../../shared/ipc-types'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

interface SkillsEditorDialogProps {
  open: boolean
  editingSkill: SkillPackInfo | null
  editedSkillContent: string
  isEditSkillLoading: boolean
  isSavingSkill: boolean
  onEditedSkillContentChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSave: () => void
}

const SkillsEditorDialog: React.FC<SkillsEditorDialogProps> = ({
  open,
  editingSkill,
  editedSkillContent,
  isEditSkillLoading,
  isSavingSkill,
  onEditedSkillContentChange,
  onOpenChange,
  onSave
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <Tabs defaultValue="edit">
              <TabsList>
                <TabsTrigger value="edit">Edit</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="edit">
                <ScrollArea className="h-105 rounded-md border">
                  <Textarea
                    value={editedSkillContent}
                    onChange={(event) => onEditedSkillContentChange(event.target.value)}
                    className="min-h-full resize-none border-0 font-mono text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
                    placeholder="Skill markdown content"
                    disabled={isSavingSkill}
                  />
                </ScrollArea>
              </TabsContent>
              <TabsContent value="preview">
                <ScrollArea className="h-105 rounded-md border">
                  <div className="p-4">
                    {editedSkillContent.trim() ? (
                      <MarkdownRenderer content={editedSkillContent} />
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Nothing to preview</p>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
            <p className="text-xs text-muted-foreground">
              Skill ID is fixed. Keep the frontmatter id aligned with $
              {editingSkill?.id || 'skill-id'}.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSavingSkill}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isEditSkillLoading || isSavingSkill}>
            {isSavingSkill ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SkillsEditorDialog
