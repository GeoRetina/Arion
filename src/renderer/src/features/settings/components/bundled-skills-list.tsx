import React from 'react'
import { Boxes, Download, Loader2, Trash2 } from 'lucide-react'
import type { SkillPackBundledCatalogSkill } from '@/../../shared/ipc-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface BundledSkillsListProps {
  bundledSkills: SkillPackBundledCatalogSkill[]
  isSkillsLoading: boolean
  isDeletingSkill: boolean
  isUploadingSkill: boolean
  isSavingSkill: boolean
  bundledSkillActionId: string | null
  onToggleBundledSkillInstalled: (skill: SkillPackBundledCatalogSkill) => void
}

const BundledSkillsList: React.FC<BundledSkillsListProps> = ({
  bundledSkills,
  isSkillsLoading,
  isDeletingSkill,
  isUploadingSkill,
  isSavingSkill,
  bundledSkillActionId,
  onToggleBundledSkillInstalled
}) => {
  if (isSkillsLoading && bundledSkills.length === 0) {
    return (
      <div className="w-full flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (bundledSkills.length === 0) {
    return (
      <div className="w-full text-center py-12 border border-dashed rounded-lg">
        <Boxes className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground mb-1">No bundled skills available</p>
        <p className="text-sm text-muted-foreground">Refresh to retry loading the catalog.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">
      {bundledSkills.map((skill) => {
        const isBusy = bundledSkillActionId === skill.id
        const isInstalled = skill.isInstalled
        const actionDisabled =
          isBusy || isDeletingSkill || isUploadingSkill || isSavingSkill || isSkillsLoading

        return (
          <Card key={skill.id} className="flex flex-col overflow-hidden transition-all hover:shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base leading-snug">{skill.name}</CardTitle>
                <Badge
                  variant="outline"
                  className="shrink-0 text-xs bg-green-500/10 text-green-600 border-green-500/20"
                >
                  bundled
                </Badge>
              </div>
              <CardDescription className="text-xs font-mono">{`$${skill.id}`}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 grow">
              <p className="text-sm text-muted-foreground">{skill.description}</p>
              <p className="text-xs text-muted-foreground/70 mt-3 break-all">{skill.repositoryPath}</p>
              <Button
                className="mt-4 w-full"
                variant={isInstalled ? 'outline' : 'default'}
                onClick={() => onToggleBundledSkillInstalled(skill)}
                disabled={actionDisabled}
              >
                {isBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isInstalled ? 'Uninstalling...' : 'Installing...'}
                  </>
                ) : isInstalled ? (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Uninstall
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Install
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export default BundledSkillsList
