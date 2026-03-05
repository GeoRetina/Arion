import React from 'react'
import { Boxes, Download, Edit, Loader2, Power, PowerOff, Trash2 } from 'lucide-react'
import type { SkillPackBundledCatalogSkill, SkillPackInfo } from '@/../../shared/ipc-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

const sourceColorMap: Record<string, string> = {
  workspace: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  managed: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  global: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  bundled: 'bg-green-500/10 text-green-600 border-green-500/20'
}

type UnifiedSkill =
  | { kind: 'bundled'; bundled: SkillPackBundledCatalogSkill; installed?: SkillPackInfo }
  | { kind: 'installed-only'; installed: SkillPackInfo }

interface BundledSkillsListProps {
  bundledSkills: SkillPackBundledCatalogSkill[]
  installedSkills: SkillPackInfo[]
  isSkillsLoading: boolean
  isDeletingSkill: boolean
  isUploadingSkill: boolean
  isSavingSkill: boolean
  bundledSkillActionId: string | null
  skillDisableTogglingId: string | null
  isSkillDisabled: (skillId: string) => boolean
  onToggleBundledSkillInstalled: (skill: SkillPackBundledCatalogSkill) => void
  onToggleSkillDisabled: (skill: SkillPackInfo) => void
  onEditSkill: (skill: SkillPackInfo) => void
  onDeleteSkill: (skill: SkillPackInfo) => void
}

function buildUnifiedList(
  bundledSkills: SkillPackBundledCatalogSkill[],
  installedSkills: SkillPackInfo[]
): UnifiedSkill[] {
  const bundledIds = new Set(bundledSkills.map((s) => s.id))
  const installedById = new Map(installedSkills.map((s) => [s.id, s]))

  const items: UnifiedSkill[] = bundledSkills.map((b) => ({
    kind: 'bundled' as const,
    bundled: b,
    installed: installedById.get(b.id)
  }))

  for (const skill of installedSkills) {
    if (!bundledIds.has(skill.id)) {
      items.push({ kind: 'installed-only' as const, installed: skill })
    }
  }

  return items
}

const BundledSkillsList: React.FC<BundledSkillsListProps> = ({
  bundledSkills,
  installedSkills,
  isSkillsLoading,
  isDeletingSkill,
  isUploadingSkill,
  isSavingSkill,
  bundledSkillActionId,
  skillDisableTogglingId,
  isSkillDisabled,
  onToggleBundledSkillInstalled,
  onToggleSkillDisabled,
  onEditSkill,
  onDeleteSkill
}) => {
  const unified = buildUnifiedList(bundledSkills, installedSkills)

  if (isSkillsLoading && unified.length === 0) {
    return (
      <div className="w-full flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (unified.length === 0) {
    return (
      <div className="w-full text-center py-12 border border-dashed rounded-lg">
        <Boxes className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground mb-1">No skills available</p>
        <p className="text-sm text-muted-foreground">
          Refresh to load the catalog or upload a skill to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 w-full">
      {unified.map((item) => {
        if (item.kind === 'bundled') {
          return (
            <BundledCard
              key={`bundled:${item.bundled.id}`}
              bundled={item.bundled}
              installed={item.installed}
              isDeletingSkill={isDeletingSkill}
              isUploadingSkill={isUploadingSkill}
              isSavingSkill={isSavingSkill}
              isSkillsLoading={isSkillsLoading}
              bundledSkillActionId={bundledSkillActionId}
              skillDisableTogglingId={skillDisableTogglingId}
              isSkillDisabled={isSkillDisabled}
              onToggleBundledSkillInstalled={onToggleBundledSkillInstalled}
              onToggleSkillDisabled={onToggleSkillDisabled}
              onEditSkill={onEditSkill}
            />
          )
        }

        return (
          <InstalledOnlyCard
            key={`installed:${item.installed.id}:${item.installed.source}`}
            skill={item.installed}
            isDeletingSkill={isDeletingSkill}
            isUploadingSkill={isUploadingSkill}
            isSavingSkill={isSavingSkill}
            skillDisableTogglingId={skillDisableTogglingId}
            isSkillDisabled={isSkillDisabled}
            onToggleSkillDisabled={onToggleSkillDisabled}
            onEditSkill={onEditSkill}
            onDeleteSkill={onDeleteSkill}
          />
        )
      })}
    </div>
  )
}

const BundledCard: React.FC<{
  bundled: SkillPackBundledCatalogSkill
  installed?: SkillPackInfo
  isDeletingSkill: boolean
  isUploadingSkill: boolean
  isSavingSkill: boolean
  isSkillsLoading: boolean
  bundledSkillActionId: string | null
  skillDisableTogglingId: string | null
  isSkillDisabled: (skillId: string) => boolean
  onToggleBundledSkillInstalled: (skill: SkillPackBundledCatalogSkill) => void
  onToggleSkillDisabled: (skill: SkillPackInfo) => void
  onEditSkill: (skill: SkillPackInfo) => void
}> = ({
  bundled,
  installed,
  isDeletingSkill,
  isUploadingSkill,
  isSavingSkill,
  isSkillsLoading,
  bundledSkillActionId,
  skillDisableTogglingId,
  isSkillDisabled,
  onToggleBundledSkillInstalled,
  onToggleSkillDisabled,
  onEditSkill
}) => {
  const isBusy = bundledSkillActionId === bundled.id
  const isInstalled = bundled.isInstalled
  const actionDisabled =
    isBusy || isDeletingSkill || isUploadingSkill || isSavingSkill || isSkillsLoading
  const disabled = installed ? isSkillDisabled(installed.id) : false

  return (
    <Card
      className={`overflow-hidden transition-all hover:shadow-md flex flex-col surface-elevated ${
        isInstalled ? 'border-primary ring-1 ring-primary' : ''
      } ${disabled ? 'opacity-70' : ''}`}
    >
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-xl leading-snug">{bundled.name}</CardTitle>
          <div className="flex items-center gap-2">
            {disabled && (
              <Badge variant="outline" className="shrink-0 text-xs">
                disabled
              </Badge>
            )}
            {isInstalled ? (
              <Badge
                variant="outline"
                className="shrink-0 text-xs bg-purple-500/10 text-purple-600 border-purple-500/20"
              >
                installed
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="shrink-0 text-xs bg-green-500/10 text-green-600 border-green-500/20"
              >
                bundled
              </Badge>
            )}
          </div>
        </div>
        <CardDescription className="text-xs font-mono">{`$${bundled.id}`}</CardDescription>
      </CardHeader>
      <CardContent className="grow px-5 py-3">
        <p className="text-sm text-muted-foreground">{bundled.description}</p>
        <p className="text-xs text-muted-foreground/70 mt-3 break-all">
          {installed?.sourcePath || bundled.repositoryPath}
        </p>
      </CardContent>
      <CardFooter className="pt-2 pb-4 px-5 mt-auto flex flex-col space-y-2">
        {isInstalled && installed && (
          <div className="flex w-full gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onToggleSkillDisabled(installed)}
              disabled={skillDisableTogglingId === installed.id || actionDisabled}
              title={disabled ? 'Enable' : 'Disable'}
              aria-label={disabled ? 'Enable skill' : 'Disable skill'}
            >
              {disabled ? (
                <Power className="h-4 w-4 mr-2" />
              ) : (
                <PowerOff className="h-4 w-4 mr-2" />
              )}
              {disabled ? 'Enable' : 'Disable'}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onEditSkill(installed)}
              disabled={actionDisabled || skillDisableTogglingId === installed.id}
              title="Edit"
              aria-label="Edit skill"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </div>
        )}
        <Button
          className="w-full"
          variant={isInstalled ? 'outline' : 'default'}
          onClick={() => onToggleBundledSkillInstalled(bundled)}
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
      </CardFooter>
    </Card>
  )
}

const InstalledOnlyCard: React.FC<{
  skill: SkillPackInfo
  isDeletingSkill: boolean
  isUploadingSkill: boolean
  isSavingSkill: boolean
  skillDisableTogglingId: string | null
  isSkillDisabled: (skillId: string) => boolean
  onToggleSkillDisabled: (skill: SkillPackInfo) => void
  onEditSkill: (skill: SkillPackInfo) => void
  onDeleteSkill: (skill: SkillPackInfo) => void
}> = ({
  skill,
  isDeletingSkill,
  isUploadingSkill,
  isSavingSkill,
  skillDisableTogglingId,
  isSkillDisabled,
  onToggleSkillDisabled,
  onEditSkill,
  onDeleteSkill
}) => {
  const disabled = isSkillDisabled(skill.id)
  const deleteLabel = skill.source === 'managed' ? 'Uninstall' : 'Delete'
  const busy = isDeletingSkill || isUploadingSkill || isSavingSkill

  return (
    <Card
      className={`overflow-hidden transition-all hover:shadow-md flex flex-col surface-elevated ${
        disabled ? 'opacity-70' : ''
      }`}
    >
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-xl leading-snug">{skill.name}</CardTitle>
          <div className="flex items-center gap-2">
            {disabled && (
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
      <CardContent className="grow px-5 py-3">
        <p className="text-sm text-muted-foreground">{skill.description}</p>
        <p className="text-xs text-muted-foreground/70 mt-3 break-all">{skill.sourcePath}</p>
      </CardContent>
      <CardFooter className="pt-2 pb-4 px-5 mt-auto flex flex-col space-y-2">
        <div className="flex w-full gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onToggleSkillDisabled(skill)}
            disabled={skillDisableTogglingId === skill.id || busy}
            title={disabled ? 'Enable' : 'Disable'}
            aria-label={disabled ? 'Enable skill' : 'Disable skill'}
          >
            {disabled ? (
              <Power className="h-4 w-4 mr-2" />
            ) : (
              <PowerOff className="h-4 w-4 mr-2" />
            )}
            {disabled ? 'Enable' : 'Disable'}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onEditSkill(skill)}
            disabled={busy || skillDisableTogglingId === skill.id}
            title="Edit"
            aria-label="Edit skill"
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
        <Button
          variant="destructive"
          className="w-full"
          onClick={() => onDeleteSkill(skill)}
          disabled={busy || skillDisableTogglingId === skill.id}
          title={deleteLabel}
          aria-label={`${deleteLabel} skill`}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {deleteLabel}
        </Button>
      </CardFooter>
    </Card>
  )
}

export default BundledSkillsList
