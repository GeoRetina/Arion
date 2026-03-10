import React from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import BundledSkillsList from './bundled-skills-list'
import SkillsEditorDialog from './skills-editor-dialog'
import { useSkillsPageState } from '../hooks/use-skills-page-state'

const SkillsPage: React.FC = () => {
  const {
    availableSkills,
    bundledCatalogSkills,
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
    bundledSkillActionId,
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
    handleToggleSkillDisabled,
    handleToggleBundledSkillInstalled
  } = useSkillsPageState()

  return (
    <ScrollArea className="h-full">
      <div className="pt-14 pb-8 px-10 md:px-20">
        <div className="flex flex-col items-start gap-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 w-full">
            <div>
              <h1 className="text-3xl font-semibold mb-2">Skills</h1>
              <p className="text-muted-foreground max-w-2xl">
                Manage your skills from the bundled catalog and other sources. Install bundled skills
                or upload your own.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
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

          <BundledSkillsList
            bundledSkills={bundledCatalogSkills}
            installedSkills={availableSkills}
            isSkillsLoading={isSkillsLoading}
            isDeletingSkill={isDeletingSkill}
            isUploadingSkill={isUploadingSkill}
            isSavingSkill={isSavingSkill}
            bundledSkillActionId={bundledSkillActionId}
            skillDisableTogglingId={skillDisableTogglingId}
            isSkillDisabled={isSkillDisabled}
            onToggleBundledSkillInstalled={(skill) => void handleToggleBundledSkillInstalled(skill)}
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
        title={skillToDelete?.source === 'managed' ? 'Uninstall Skill' : 'Delete Skill'}
        description={`${
          skillToDelete?.source === 'managed' ? 'Uninstall' : 'Delete'
        } $${skillToDelete?.id || ''}? This action cannot be undone.`}
        confirmText={
          isDeletingSkill
            ? skillToDelete?.source === 'managed'
              ? 'Uninstalling...'
              : 'Deleting...'
            : skillToDelete?.source === 'managed'
              ? 'Uninstall'
              : 'Delete'
        }
        onConfirm={handleDeleteSkill}
        variant="destructive"
      />
    </ScrollArea>
  )
}

export default SkillsPage
