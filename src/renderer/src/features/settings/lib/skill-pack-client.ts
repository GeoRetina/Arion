import type {
  SkillPackConfig,
  SkillPackInfo,
  SkillPackSkillContentResult,
  SkillPackSkillDeleteResult,
  SkillPackSkillTarget,
  SkillPackSkillUpdatePayload,
  SkillPackSkillUpdateResult
} from '@/../../shared/ipc-types'

const PRELOAD_REFRESH_ERROR =
  'Skill operation for this source requires restarting Arion to refresh the preload bridge.'

const readDisabledSkillIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((id): id is string => typeof id === 'string')
}

export const normalizeSkillPackConfig = (config: SkillPackConfig): SkillPackConfig => {
  return {
    workspaceRoot:
      typeof config.workspaceRoot === 'string' && config.workspaceRoot.trim().length > 0
        ? config.workspaceRoot.trim()
        : null,
    disabledSkillIds: readDisabledSkillIds(config.disabledSkillIds)
  }
}

export const listAvailableSkills = async (): Promise<SkillPackInfo[]> => {
  return window.ctg.settings.listAvailableSkills()
}

export const getSkillPackConfig = async (): Promise<SkillPackConfig> => {
  const config = await window.ctg.settings.getSkillPackConfig()
  return normalizeSkillPackConfig(config)
}

export const setSkillPackConfig = async (config: SkillPackConfig): Promise<void> => {
  await window.ctg.settings.setSkillPackConfig(normalizeSkillPackConfig(config))
}

export const getSkillContentCompat = async (skill: SkillPackInfo): Promise<string> => {
  const settingsApi = window.ctg.settings as unknown as {
    getSkillContent?: (target: SkillPackSkillTarget) => Promise<SkillPackSkillContentResult>
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

  throw new Error(PRELOAD_REFRESH_ERROR)
}

export const updateSkillCompat = async (skill: SkillPackInfo, content: string): Promise<string> => {
  const settingsApi = window.ctg.settings as unknown as {
    updateSkill?: (payload: SkillPackSkillUpdatePayload) => Promise<SkillPackSkillUpdateResult>
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

  throw new Error(PRELOAD_REFRESH_ERROR)
}

export const deleteSkillCompat = async (
  skill: SkillPackInfo
): Promise<{ id: string; deleted: boolean }> => {
  const settingsApi = window.ctg.settings as unknown as {
    deleteSkill?: (target: SkillPackSkillTarget) => Promise<SkillPackSkillDeleteResult>
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

  throw new Error(PRELOAD_REFRESH_ERROR)
}
