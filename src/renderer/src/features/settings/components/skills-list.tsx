import React from 'react'
import { Boxes, Edit, Loader2, Power, PowerOff, Trash2 } from 'lucide-react'
import type { SkillPackInfo } from '@/../../shared/ipc-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface SkillsListProps {
  availableSkills: SkillPackInfo[]
  isSkillsLoading: boolean
  isDeletingSkill: boolean
  isUploadingSkill: boolean
  isSavingSkill: boolean
  skillDisableTogglingId: string | null
  isSkillDisabled: (skillId: string) => boolean
  onToggleSkillDisabled: (skill: SkillPackInfo) => void
  onEditSkill: (skill: SkillPackInfo) => void
  onDeleteSkill: (skill: SkillPackInfo) => void
}

const sourceColorMap: Record<string, string> = {
  workspace: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  managed: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  global: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  bundled: 'bg-green-500/10 text-green-600 border-green-500/20'
}

const SkillsList: React.FC<SkillsListProps> = ({
  availableSkills,
  isSkillsLoading,
  isDeletingSkill,
  isUploadingSkill,
  isSavingSkill,
  skillDisableTogglingId,
  isSkillDisabled,
  onToggleSkillDisabled,
  onEditSkill,
  onDeleteSkill
}) => {
  if (isSkillsLoading) {
    return (
      <div className="w-full flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (availableSkills.length === 0) {
    return (
      <div className="w-full text-center py-12 border border-dashed rounded-lg">
        <Boxes className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground mb-1">No skills found</p>
        <p className="text-sm text-muted-foreground">Upload a skill to get started.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">
      {availableSkills.map((skill) => (
        <Card
          key={`${skill.id}:${skill.source}`}
          className={`flex flex-col overflow-hidden transition-all hover:shadow-md ${
            isSkillDisabled(skill.id) ? 'opacity-70' : ''
          }`}
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base leading-snug">{skill.name}</CardTitle>
              <div className="flex items-center gap-2">
                {isSkillDisabled(skill.id) && (
                  <Badge variant="outline" className="shrink-0 text-xs">
                    disabled
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={`shrink-0 text-xs ${sourceColorMap[skill.source] || ''}`}
                >
                  {skill.source}
                </Badge>
              </div>
            </div>
            <CardDescription className="text-xs font-mono">{`$${skill.id}`}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 grow">
            <p className="text-sm text-muted-foreground">{skill.description}</p>
            <p className="text-xs text-muted-foreground/70 mt-3 break-all">{skill.sourcePath}</p>
            <div className="mt-4 flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => onToggleSkillDisabled(skill)}
                disabled={
                  skillDisableTogglingId === skill.id ||
                  isDeletingSkill ||
                  isUploadingSkill ||
                  isSavingSkill
                }
                title={isSkillDisabled(skill.id) ? 'Enable' : 'Disable'}
                aria-label={isSkillDisabled(skill.id) ? 'Enable skill' : 'Disable skill'}
              >
                {isSkillDisabled(skill.id) ? (
                  <Power className="h-4 w-4" />
                ) : (
                  <PowerOff className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => onEditSkill(skill)}
                disabled={
                  isDeletingSkill ||
                  isUploadingSkill ||
                  isSavingSkill ||
                  skillDisableTogglingId === skill.id
                }
                title="Edit"
                aria-label="Edit skill"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
                onClick={() => onDeleteSkill(skill)}
                disabled={
                  isDeletingSkill ||
                  isUploadingSkill ||
                  isSavingSkill ||
                  skillDisableTogglingId === skill.id
                }
                title="Delete"
                aria-label="Delete skill"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default SkillsList
