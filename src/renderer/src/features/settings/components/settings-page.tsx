import React, { useState, useEffect } from 'react'
import {
  Moon,
  Sun,
  Monitor,
  Info,
  RefreshCw,
  RotateCw,
  SlidersHorizontal,
  MessageSquareText,
  Sparkles,
  FolderTree,
  Puzzle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toggle } from '@/components/ui/toggle'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useThemeStore, applyTheme } from '@/stores/theme-store'
import { SkillPackConfig, SkillPackInfo, SystemPromptConfig } from '@/../../shared/ipc-types'
import { toast } from 'sonner'
import { PluginsPage } from './plugins-page'

const SettingsPage: React.FC = () => {
  const { theme, setTheme } = useThemeStore()
  const [appVersion, setAppVersion] = useState<string>('loading...')
  const [systemPromptConfig, setSystemPromptConfig] = useState<SystemPromptConfig>({
    userSystemPrompt: ''
  })
  const [skillPackConfig, setSkillPackConfig] = useState<SkillPackConfig>({
    workspaceRoot: ''
  })
  const [availableSkills, setAvailableSkills] = useState<SkillPackInfo[]>([])
  const [isSkillsLoading, setIsSkillsLoading] = useState(true)
  const [isSavingSkillConfig, setIsSavingSkillConfig] = useState(false)
  const [isBootstrappingTemplates, setIsBootstrappingTemplates] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Handle theme change
  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system'): void => {
    setTheme(newTheme)
    applyTheme(newTheme)
  }

  // Load system prompt settings
  useEffect(() => {
    const fetchSystemPromptConfig = async (): Promise<void> => {
      try {
        const config = await window.ctg.settings.getSystemPromptConfig()
        setSystemPromptConfig(config)
        setIsLoading(false)
      } catch {
        setIsLoading(false)
      }
    }
    fetchSystemPromptConfig()
  }, [])

  useEffect(() => {
    const fetchSkillPackState = async (): Promise<void> => {
      setIsSkillsLoading(true)
      try {
        const config = await window.ctg.settings.getSkillPackConfig()
        setSkillPackConfig(config)
        const resolvedWorkspaceRoot =
          typeof config.workspaceRoot === 'string' && config.workspaceRoot.trim().length > 0
            ? config.workspaceRoot.trim()
            : undefined
        const skills = await window.ctg.settings.listAvailableSkills(resolvedWorkspaceRoot)
        setAvailableSkills(skills)
      } catch {
        setAvailableSkills([])
      } finally {
        setIsSkillsLoading(false)
      }
    }

    fetchSkillPackState()
  }, [])

  // Handle user system prompt change
  const handleUserSystemPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setSystemPromptConfig((prev) => ({
      ...prev,
      userSystemPrompt: e.target.value
    }))
  }

  // Save system prompt settings
  const handleSaveSystemPrompt = async (): Promise<void> => {
    try {
      await window.ctg.settings.setSystemPromptConfig(systemPromptConfig)
      toast.success('System prompt settings saved successfully!')
    } catch (error) {
      toast.error('Failed to save system prompt settings.', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    }
  }

  // Reset user system prompt
  const handleResetUserSystemPrompt = (): void => {
    setSystemPromptConfig((prev) => ({
      ...prev,
      userSystemPrompt: ''
    }))
  }

  const handleWorkspaceRootChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const nextValue = e.target.value
    setSkillPackConfig((prev) => ({
      ...prev,
      workspaceRoot: nextValue
    }))
  }

  const handleSaveSkillPackConfig = async (): Promise<void> => {
    setIsSavingSkillConfig(true)
    try {
      const normalizedWorkspaceRoot =
        typeof skillPackConfig.workspaceRoot === 'string' &&
        skillPackConfig.workspaceRoot.trim().length > 0
          ? skillPackConfig.workspaceRoot.trim()
          : null

      await window.ctg.settings.setSkillPackConfig({
        workspaceRoot: normalizedWorkspaceRoot
      })
      const refreshedSkills = await window.ctg.settings.listAvailableSkills(
        normalizedWorkspaceRoot || undefined
      )
      setAvailableSkills(refreshedSkills)
      toast.success('Skill pack settings saved')
    } catch (error) {
      toast.error('Failed to save skill pack settings', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    } finally {
      setIsSavingSkillConfig(false)
    }
  }

  const handleRefreshSkills = async (): Promise<void> => {
    setIsSkillsLoading(true)
    try {
      const normalizedWorkspaceRoot =
        typeof skillPackConfig.workspaceRoot === 'string' &&
        skillPackConfig.workspaceRoot.trim().length > 0
          ? skillPackConfig.workspaceRoot.trim()
          : undefined
      const skills = await window.ctg.settings.listAvailableSkills(normalizedWorkspaceRoot)
      setAvailableSkills(skills)
      toast.success('Skills refreshed')
    } catch (error) {
      toast.error('Failed to refresh skills', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    } finally {
      setIsSkillsLoading(false)
    }
  }

  const handleBootstrapTemplates = async (): Promise<void> => {
    const normalizedWorkspaceRoot =
      typeof skillPackConfig.workspaceRoot === 'string' &&
      skillPackConfig.workspaceRoot.trim().length > 0
        ? skillPackConfig.workspaceRoot.trim()
        : ''

    if (!normalizedWorkspaceRoot) {
      toast.error('Workspace root is required to bootstrap templates')
      return
    }

    setIsBootstrappingTemplates(true)
    try {
      const result = await window.ctg.settings.bootstrapWorkspaceTemplates(normalizedWorkspaceRoot)
      await handleRefreshSkills()
      toast.success('Workspace templates processed', {
        description: `Created ${result.created.length}, existing ${result.existing.length}`
      })
    } catch (error) {
      toast.error('Failed to bootstrap workspace templates', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    } finally {
      setIsBootstrappingTemplates(false)
    }
  }

  useEffect(() => {
    const fetchVersion = async (): Promise<void> => {
      try {
        const version = await window.ctg.getAppVersion()
        setAppVersion(version ? `v${version}` : 'N/A')
      } catch {
        setAppVersion('Error')
      }
    }
    fetchVersion()
  }, [])

  return (
    <ScrollArea className="h-[calc(100vh-56px)]">
      <div className="py-8 px-4 md:px-6">
        <div className="flex flex-col items-start gap-6">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Settings</h1>
            <p className="text-muted-foreground max-w-2xl">
              Configure your Arion experience and customize how the application works.
            </p>
          </div>

          <div className="w-xl">
            <Tabs defaultValue="appearance" className="w-full">
              <TabsList className="grid grid-cols-6 mb-6">
                <TabsTrigger value="appearance" className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>Appearance</span>
                </TabsTrigger>
                <TabsTrigger value="prompts" className="flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4" />
                  <span>System Prompts</span>
                </TabsTrigger>
                <TabsTrigger value="skills" className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <span>Skills</span>
                </TabsTrigger>
                <TabsTrigger value="updates" className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  <span>Updates</span>
                </TabsTrigger>
                <TabsTrigger value="plugins" className="flex items-center gap-2">
                  <Puzzle className="h-4 w-4" />
                  <span>Plugins</span>
                </TabsTrigger>
                <TabsTrigger value="about" className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  <span>About</span>
                </TabsTrigger>
              </TabsList>

              {/* Appearance Tab */}
              <TabsContent value="appearance">
                <h2 className="text-xl font-medium mb-5">Theme Settings</h2>
                <Card>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle>Appearance</CardTitle>
                    <CardDescription>Manage the visual style of your application</CardDescription>
                  </CardHeader>
                  <CardContent className="px-5 py-3 space-y-6">
                    {/* Theme Selection */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-medium">Select Theme</h3>
                      <div className="flex flex-wrap gap-4">
                        <Toggle
                          variant="outline"
                          pressed={theme === 'light'}
                          onPressedChange={() => handleThemeChange('light')}
                          className="flex items-center gap-2 data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:border-primary/50 min-w-28 justify-center"
                        >
                          <Sun className="h-4 w-4" />
                          <span>Light</span>
                        </Toggle>

                        <Toggle
                          variant="outline"
                          pressed={theme === 'dark'}
                          onPressedChange={() => handleThemeChange('dark')}
                          className="flex items-center gap-2 data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:border-primary/50 min-w-28 justify-center"
                        >
                          <Moon className="h-4 w-4" />
                          <span>Dark</span>
                        </Toggle>

                        <Toggle
                          variant="outline"
                          pressed={theme === 'system'}
                          onPressedChange={() => handleThemeChange('system')}
                          className="flex items-center gap-2 data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:border-primary/50 min-w-28 justify-center"
                        >
                          <Monitor className="h-4 w-4" />
                          <span>System</span>
                        </Toggle>
                      </div>
                    </div>

                    {/* Font Size */}
                    {/*
                    <div className="space-y-4 pt-2">
                      <h3 className="text-sm font-medium">Font Size</h3>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="text-xs">
                          Small
                        </Button>
                        <Button variant="outline" size="sm" className="text-sm">
                          Medium
                        </Button>
                        <Button variant="outline" size="sm" className="text-base">
                          Large
                        </Button>
                      </div>
                    </div>
                    */}

                    {/* Interface Density */}
                    {/*
                    <div className="space-y-4 pt-2">
                      <h3 className="text-sm font-medium">Interface Density</h3>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm">
                          Compact
                        </Button>
                        <Button variant="outline" size="sm">
                          Comfortable
                        </Button>
                      </div>
                    </div>
                    */}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Skills Tab */}
              <TabsContent value="skills">
                <h2 className="text-xl font-medium mb-5">Skills and Templates</h2>
                <Card>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle>Skill Pack Configuration</CardTitle>
                    <CardDescription>
                      Configure workspace skill precedence and bootstrap workspace templates.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-5 py-3 space-y-6">
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Workspace Root</h3>
                      <Input
                        value={skillPackConfig.workspaceRoot || ''}
                        onChange={handleWorkspaceRootChange}
                        placeholder="/path/to/workspace"
                      />
                      <p className="text-xs text-muted-foreground">
                        Precedence order: workspace &gt; global/managed &gt; bundled
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button onClick={handleSaveSkillPackConfig} disabled={isSavingSkillConfig}>
                        {isSavingSkillConfig ? 'Saving...' : 'Save Skill Settings'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleRefreshSkills}
                        disabled={isSkillsLoading}
                      >
                        {isSkillsLoading ? 'Refreshing...' : 'Refresh Skills'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleBootstrapTemplates}
                        disabled={isBootstrappingTemplates}
                      >
                        <FolderTree className="h-4 w-4 mr-2" />
                        {isBootstrappingTemplates ? 'Bootstrapping...' : 'Bootstrap Templates'}
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">
                        Resolved Skills ({availableSkills.length})
                      </h3>
                      {isSkillsLoading ? (
                        <div className="text-sm text-muted-foreground">Loading skills...</div>
                      ) : availableSkills.length === 0 ? (
                        <div className="text-sm text-muted-foreground">
                          No skills found for current resolution paths.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                          {availableSkills.map((skill) => (
                            <div
                              key={`${skill.id}:${skill.source}`}
                              className="rounded-md border border-border/60 px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-medium text-sm">{skill.name}</div>
                                <Badge variant="outline">{skill.source}</Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">{`$${skill.id}`}</div>
                              <div className="text-xs mt-1">{skill.description}</div>
                              <div className="text-[11px] text-muted-foreground mt-1 break-all">
                                {skill.sourcePath}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* System Prompts Tab */}
              <TabsContent value="prompts">
                <h2 className="text-xl font-medium mb-5">System Prompt Settings</h2>
                <Card>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle>LLM System Prompts</CardTitle>
                    <CardDescription>
                      Configure the system prompts used for AI interactions
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-5 py-3 space-y-6">
                    {isLoading ? (
                      <div>Loading system prompt settings...</div>
                    ) : (
                      <>
                        {/* User System Prompt (Editable) */}
                        <div className="space-y-2">
                          <h3 className="text-sm font-medium">Your Custom System Instructions</h3>
                          <Textarea
                            value={systemPromptConfig.userSystemPrompt}
                            onChange={handleUserSystemPromptChange}
                            placeholder="Add your custom instructions to guide Arion's behavior..."
                            className="min-h-[200px] bg-input text-foreground resize-y border border-border focus:border-primary/50 focus:ring-2"
                          />
                          <p className="text-xs text-muted-foreground">
                            Use this to customize how Arion interacts with you. These instructions
                            will be combined with Arion&apos;s internal system prompt.
                          </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-4">
                          <Button variant="outline" onClick={handleResetUserSystemPrompt}>
                            Reset
                          </Button>
                          <Button onClick={handleSaveSystemPrompt}>Save Changes</Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Updates Tab */}
              <TabsContent value="updates">
                <h2 className="text-xl font-medium mb-5">Application Updates</h2>
                <Card>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle>Updates</CardTitle>
                    <CardDescription>
                      Manage how Arion checks for and installs updates
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-5 py-3 space-y-6">
                    <div className="rounded-lg bg-muted/50 p-6 flex flex-col sm:flex-row gap-4 justify-between items-center">
                      <div>
                        <h3 className="font-medium mb-1">Current Version</h3>
                        <p className="text-sm text-muted-foreground">Arion {appVersion}</p>
                      </div>
                      <Button variant="outline" className="flex items-center gap-2">
                        <RotateCw className="h-4 w-4" />
                        Check for Updates
                      </Button>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-sm font-medium">Update Settings</h3>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center space-x-2">
                          <input type="checkbox" id="autoUpdate" className="rounded" />
                          <label htmlFor="autoUpdate" className="text-sm">
                            Automatically check for updates
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input type="checkbox" id="betaChannel" className="rounded" />
                          <label htmlFor="betaChannel" className="text-sm">
                            Include beta versions
                          </label>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Plugins Tab */}
              <TabsContent value="plugins">
                <h2 className="text-xl font-medium mb-5">Plugins and Hooks</h2>
                <PluginsPage />
              </TabsContent>

              {/* About Tab */}
              <TabsContent value="about">
                <h2 className="text-xl font-medium mb-5">About Arion</h2>
                <Card>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle>Application Information</CardTitle>
                    <CardDescription>Details about your Arion installation</CardDescription>
                  </CardHeader>
                  <CardContent className="px-5 py-3 space-y-4">
                    <div className="rounded-lg bg-muted/50 p-6">
                      <h3 className="font-medium mb-2">Arion {appVersion}</h3>
                      <p className="text-sm text-muted-foreground">
                        Arion is a modular, scalable, open-source desktop application for geospatial
                        analysis. Developed by the GeoRetina team.
                      </p>
                      <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap gap-4">
                        <Button variant="outline" size="sm">
                          View License
                        </Button>
                        {/* <Button variant="outline" size="sm">
                          Documentation
                        </Button>
                        <Button variant="outline" size="sm">
                          Report an Issue
                        </Button> */}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}

export default SettingsPage
