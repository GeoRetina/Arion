import React from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import SkillsEditorDialog from './skills-editor-dialog'
import SkillsList from './skills-list'
import { useSkillsPageState } from '../hooks/use-skills-page-state'

const SkillsPage: React.FC = () => {
  const {
    availableSkills,
    isSkillsLoading,
    isUploadingSkill,
    isEditDialogOpen,
    isEditSkillLoading,
    isSavingSkill,
    editingSkill,
    editedSkillContent,
    isDeleteDialogOpen,
    isDeletingSkill,
    skillToDelete,
    skillDisableTogglingId,
    skillUploadInputRef,
    setEditedSkillContent,
    handleRefreshSkills,
    handleUploadClick,
    handleUploadSkill,
    handleEditSkill,
    handleSaveEditedSkill,
    handleDeleteClick,
    handleDeleteSkill,
    handleEditDialogOpenChange,
    handleDeleteDialogOpenChange,
    isSkillDisabled,
    handleToggleSkillDisabled
  } = useSkillsPageState()

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
                <Plus className="h-4 w-4 mr-2" />
                {isUploadingSkill ? 'Adding...' : 'Add Skill'}
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
          <SkillsList
            availableSkills={availableSkills}
            isSkillsLoading={isSkillsLoading}
            isDeletingSkill={isDeletingSkill}
            isUploadingSkill={isUploadingSkill}
            isSavingSkill={isSavingSkill}
            skillDisableTogglingId={skillDisableTogglingId}
            isSkillDisabled={isSkillDisabled}
            onToggleSkillDisabled={(skill) => void handleToggleSkillDisabled(skill)}
            onEditSkill={(skill) => void handleEditSkill(skill)}
            onDeleteSkill={handleDeleteClick}
          />
        </div>
      </div>

      <SkillsEditorDialog
        open={isEditDialogOpen}
        editingSkill={editingSkill}
        editedSkillContent={editedSkillContent}
        isEditSkillLoading={isEditSkillLoading}
        isSavingSkill={isSavingSkill}
        onEditedSkillContentChange={setEditedSkillContent}
        onOpenChange={handleEditDialogOpenChange}
        onSave={() => void handleSaveEditedSkill()}
      />

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
