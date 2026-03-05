import { useCallback, useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { toast } from 'sonner'
import type {
  SkillPackBundledCatalogSkill,
  SkillPackConfig,
  SkillPackInfo
} from '@/../../shared/ipc-types'
import {
  deleteSkillCompat,
  getSkillContentCompat,
  getSkillPackConfig,
  installBundledSkill,
  listAvailableSkills,
  listBundledSkillCatalog,
  setSkillPackConfig,
  updateSkillCompat
} from '../lib/skill-pack-client'

const DEFAULT_SKILL_PACK_CONFIG: SkillPackConfig = {
  workspaceRoot: null,
  disabledSkillIds: []
}

export interface UseSkillsPageStateResult {
  availableSkills: SkillPackInfo[]
  bundledCatalogSkills: SkillPackBundledCatalogSkill[]
  skillPackConfig: SkillPackConfig
  isSkillsLoading: boolean
  isUploadingSkill: boolean
  isEditDialogOpen: boolean
  isEditSkillLoading: boolean
  isSavingSkill: boolean
  editingSkill: SkillPackInfo | null
  editedSkillContent: string
  isDeleteDialogOpen: boolean
  isDeletingSkill: boolean
  skillToDelete: SkillPackInfo | null
  skillDisableTogglingId: string | null
  bundledSkillActionId: string | null
  skillUploadInputRef: RefObject<HTMLInputElement | null>
  setEditedSkillContent: (value: string) => void
  handleRefreshSkills: () => Promise<void>
  handleUploadClick: () => void
  handleUploadSkill: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  handleEditSkill: (skill: SkillPackInfo) => Promise<void>
  handleSaveEditedSkill: () => Promise<void>
  handleDeleteClick: (skill: SkillPackInfo) => void
  handleDeleteSkill: () => Promise<void>
  handleEditDialogOpenChange: (open: boolean) => void
  handleDeleteDialogOpenChange: (open: boolean) => void
  isSkillDisabled: (skillId: string) => boolean
  handleToggleSkillDisabled: (skill: SkillPackInfo) => Promise<void>
  handleToggleBundledSkillInstalled: (skill: SkillPackBundledCatalogSkill) => Promise<void>
}

export const useSkillsPageState = (): UseSkillsPageStateResult => {
  const [availableSkills, setAvailableSkills] = useState<SkillPackInfo[]>([])
  const [bundledCatalogSkills, setBundledCatalogSkills] = useState<SkillPackBundledCatalogSkill[]>(
    []
  )
  const [skillPackConfigState, setSkillPackConfigState] =
    useState<SkillPackConfig>(DEFAULT_SKILL_PACK_CONFIG)
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
  const [skillDisableTogglingId, setSkillDisableTogglingId] = useState<string | null>(null)
  const [bundledSkillActionId, setBundledSkillActionId] = useState<string | null>(null)
  const skillUploadInputRef = useRef<HTMLInputElement | null>(null)

  const fetchSkills = useCallback(async (): Promise<void> => {
    const skills = await listAvailableSkills()
    setAvailableSkills(skills)
  }, [])

  const fetchBundledCatalog = useCallback(async (): Promise<void> => {
    const catalog = await listBundledSkillCatalog()
    setBundledCatalogSkills(catalog)
  }, [])

  const fetchSkillPackConfig = useCallback(async (): Promise<void> => {
    const config = await getSkillPackConfig()
    setSkillPackConfigState(config)
  }, [])

  const refreshSkillInventory = useCallback(async (): Promise<void> => {
    await fetchSkills()
    try {
      await fetchBundledCatalog()
    } catch {
      setBundledCatalogSkills([])
    }
  }, [fetchBundledCatalog, fetchSkills])

  useEffect(() => {
    const fetchSkillPackState = async (): Promise<void> => {
      setIsSkillsLoading(true)
      try {
        await Promise.all([refreshSkillInventory(), fetchSkillPackConfig()])
      } finally {
        setIsSkillsLoading(false)
      }
    }

    void fetchSkillPackState()
  }, [fetchSkillPackConfig, refreshSkillInventory])

  const handleRefreshSkills = useCallback(async (): Promise<void> => {
    setIsSkillsLoading(true)
    try {
      const results = await Promise.allSettled([
        fetchSkills(),
        fetchBundledCatalog(),
        fetchSkillPackConfig()
      ])
      if (results[1].status === 'rejected') {
        setBundledCatalogSkills([])
      }
      const firstError = results.find((result) => result.status === 'rejected')
      if (!firstError) {
        toast.success('Skills refreshed')
      } else {
        toast.error('Failed to refresh skills', {
          description:
            firstError.reason instanceof Error
              ? firstError.reason.message
              : 'An unknown error occurred'
        })
      }
    } finally {
      setIsSkillsLoading(false)
    }
  }, [fetchBundledCatalog, fetchSkillPackConfig, fetchSkills])

  const handleUploadClick = useCallback((): void => {
    skillUploadInputRef.current?.click()
  }, [])

  const handleUploadSkill = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
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

        await refreshSkillInventory()

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
    },
    [refreshSkillInventory]
  )

  const handleEditSkill = useCallback(async (skill: SkillPackInfo): Promise<void> => {
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
  }, [])

  const handleSaveEditedSkill = useCallback(async (): Promise<void> => {
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
      await refreshSkillInventory()
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
  }, [editedSkillContent, editingSkill, refreshSkillInventory])

  const handleDeleteClick = useCallback((skill: SkillPackInfo): void => {
    setSkillToDelete(skill)
    setIsDeleteDialogOpen(true)
  }, [])

  const handleDeleteSkill = useCallback(async (): Promise<void> => {
    if (!skillToDelete) {
      return
    }

    setIsDeletingSkill(true)
    try {
      const result = await deleteSkillCompat(skillToDelete)
      if (!result.deleted) {
        throw new Error(`Skill "${skillToDelete.id}" was not found`)
      }
      await refreshSkillInventory()
      toast.success(`Skill $${result.id} deleted`)
      setSkillToDelete(null)
    } catch (error) {
      toast.error('Failed to delete skill', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    } finally {
      setIsDeletingSkill(false)
    }
  }, [refreshSkillInventory, skillToDelete])

  const handleEditDialogOpenChange = useCallback((open: boolean): void => {
    setIsEditDialogOpen(open)
    if (!open) {
      setEditingSkill(null)
      setEditedSkillContent('')
      setIsEditSkillLoading(false)
    }
  }, [])

  const handleDeleteDialogOpenChange = useCallback((open: boolean): void => {
    setIsDeleteDialogOpen(open)
    if (!open) {
      setSkillToDelete(null)
    }
  }, [])

  const isSkillDisabled = useCallback(
    (skillId: string): boolean => {
      return (skillPackConfigState.disabledSkillIds || []).includes(skillId)
    },
    [skillPackConfigState.disabledSkillIds]
  )

  const handleToggleSkillDisabled = useCallback(
    async (skill: SkillPackInfo): Promise<void> => {
      const currentDisabled = new Set(skillPackConfigState.disabledSkillIds || [])
      const willDisable = !currentDisabled.has(skill.id)

      if (willDisable) {
        currentDisabled.add(skill.id)
      } else {
        currentDisabled.delete(skill.id)
      }

      const nextDisabledIds = Array.from(currentDisabled.values()).sort((a, b) =>
        a.localeCompare(b)
      )

      setSkillDisableTogglingId(skill.id)
      try {
        await setSkillPackConfig({
          workspaceRoot:
            typeof skillPackConfigState.workspaceRoot === 'string'
              ? skillPackConfigState.workspaceRoot
              : null,
          disabledSkillIds: nextDisabledIds
        })

        setSkillPackConfigState((previous) => ({
          ...previous,
          disabledSkillIds: nextDisabledIds
        }))

        toast.success(`Skill $${skill.id} ${willDisable ? 'disabled' : 'enabled'}`)
      } catch (error) {
        toast.error(`Failed to ${willDisable ? 'disable' : 'enable'} skill`, {
          description: error instanceof Error ? error.message : 'An unknown error occurred'
        })
      } finally {
        setSkillDisableTogglingId(null)
      }
    },
    [skillPackConfigState.disabledSkillIds, skillPackConfigState.workspaceRoot]
  )

  const handleToggleBundledSkillInstalled = useCallback(
    async (skill: SkillPackBundledCatalogSkill): Promise<void> => {
      const isInstalled = skill.isInstalled
      setBundledSkillActionId(skill.id)
      try {
        if (isInstalled) {
          const result = await window.ctg.settings.deleteManagedSkill(skill.id)
          if (!result.deleted) {
            throw new Error(`Skill "${skill.id}" was not found`)
          }
          toast.success(`Skill $${skill.id} uninstalled`)
        } else {
          const result = await installBundledSkill(skill.id)
          toast.success(`Skill $${result.id} installed`, {
            description: result.overwritten
              ? 'An existing managed skill with the same id was replaced.'
              : undefined
          })
        }
        await refreshSkillInventory()
      } catch (error) {
        toast.error(`Failed to ${isInstalled ? 'uninstall' : 'install'} skill`, {
          description: error instanceof Error ? error.message : 'An unknown error occurred'
        })
      } finally {
        setBundledSkillActionId(null)
      }
    },
    [refreshSkillInventory]
  )

  return {
    availableSkills,
    bundledCatalogSkills,
    skillPackConfig: skillPackConfigState,
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
  }
}
