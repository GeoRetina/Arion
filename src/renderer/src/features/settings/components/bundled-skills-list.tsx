import React from 'react'
import { Boxes, Download, Loader2, Settings2, Trash2 } from 'lucide-react'
import type { SkillPackBundledCatalogSkill, SkillPackInfo } from '@/../../shared/ipc-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'

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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
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
      className={`flex flex-col overflow-hidden transition-all surface-elevated gap-0 py-0 border-border/60 hover:border-border ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{bundled.name}</span>
          </div>
          <p className="text-xs font-mono text-muted-foreground">{`$${bundled.id}`}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isInstalled ? (
            <Badge
              variant="outline"
              className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20"
            >
              installed
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-background"
            >
              official
            </Badge>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 pb-3">
        <p className="text-xs text-muted-foreground line-clamp-2">{bundled.description}</p>
      </div>

      <div className="border-t border-border/40 px-4 py-2 flex items-center gap-1 mt-auto">
        {isInstalled && installed && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1.5"
            onClick={() => onEditSkill(installed)}
            disabled={actionDisabled || skillDisableTogglingId === installed.id}
            aria-label="Edit skill"
          >
            <Settings2 className="h-3 w-3" />
            Edit
          </Button>
        )}
        <Button
          size="sm"
          variant={isInstalled ? 'ghost' : 'default'}
          className={`h-7 text-xs gap-1.5 ${isInstalled ? 'text-destructive hover:text-destructive hover:bg-destructive/10' : ''}`}
          onClick={() => onToggleBundledSkillInstalled(bundled)}
          disabled={actionDisabled}
        >
          {isBusy ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              {isInstalled ? 'Uninstalling...' : 'Installing...'}
            </>
          ) : isInstalled ? (
            <>
              <Trash2 className="h-3 w-3" />
              Uninstall
            </>
          ) : (
            <>
              <Download className="h-3 w-3" />
              Install
            </>
          )}
        </Button>
        {isInstalled && installed && (
          <div className="ml-auto flex items-center">
            <Switch
              checked={!disabled}
              onCheckedChange={() => onToggleSkillDisabled(installed)}
              disabled={skillDisableTogglingId === installed.id || actionDisabled}
              aria-label={disabled ? 'Enable skill' : 'Disable skill'}
            />
          </div>
        )}
      </div>
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
      className={`flex flex-col overflow-hidden transition-all surface-elevated gap-0 py-0 border-border/60 hover:border-border ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{skill.name}</span>
          </div>
          <p className="text-xs font-mono text-muted-foreground">{`$${skill.id}`}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={`text-xs ${sourceColorMap[skill.source] || ''}`}>
            {skill.source}
          </Badge>
        </div>
      </div>

      <div className="flex-1 px-4 pb-3">
        <p className="text-xs text-muted-foreground line-clamp-2">{skill.description}</p>
      </div>

      <div className="border-t border-border/40 px-4 py-2 flex items-center gap-1 mt-auto">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1.5"
          onClick={() => onEditSkill(skill)}
          disabled={busy || skillDisableTogglingId === skill.id}
          aria-label="Edit skill"
        >
          <Settings2 className="h-3 w-3" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
          onClick={() => onDeleteSkill(skill)}
          disabled={busy || skillDisableTogglingId === skill.id}
          aria-label={`${deleteLabel} skill`}
        >
          <Trash2 className="h-3 w-3" />
          {deleteLabel}
        </Button>
        <div className="ml-auto flex items-center">
          <Switch
            checked={!disabled}
            onCheckedChange={() => onToggleSkillDisabled(skill)}
            disabled={skillDisableTogglingId === skill.id || busy}
            aria-label={disabled ? 'Enable skill' : 'Disable skill'}
          />
        </div>
      </div>
    </Card>
  )
}

export default BundledSkillsList
