import React, { useEffect, useRef, useState } from 'react'
import { Upload, RefreshCw, Loader2, Boxes } from 'lucide-react'
import { toast } from 'sonner'
import { SkillPackInfo } from '@/../../shared/ipc-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

const SkillsPage: React.FC = () => {
  const [availableSkills, setAvailableSkills] = useState<SkillPackInfo[]>([])
  const [isSkillsLoading, setIsSkillsLoading] = useState(true)
  const [isUploadingSkill, setIsUploadingSkill] = useState(false)
  const skillUploadInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const fetchSkillPackState = async (): Promise<void> => {
      setIsSkillsLoading(true)
      try {
        const skills = await window.ctg.settings.listAvailableSkills()
        setAvailableSkills(skills)
      } catch {
        setAvailableSkills([])
      } finally {
        setIsSkillsLoading(false)
      }
    }

    fetchSkillPackState()
  }, [])

  const handleRefreshSkills = async (): Promise<void> => {
    setIsSkillsLoading(true)
    try {
      const skills = await window.ctg.settings.listAvailableSkills()
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

  const handleUploadClick = (): void => {
    skillUploadInputRef.current?.click()
  }

  const handleUploadSkill = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
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

      const refreshedSkills = await window.ctg.settings.listAvailableSkills()
      setAvailableSkills(refreshedSkills)

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
  }

  const sourceColorMap: Record<string, string> = {
    workspace: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    managed: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    bundled: 'bg-green-500/10 text-green-600 border-green-500/20'
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-8 px-4 md:px-6">
        <div className="flex flex-col items-start gap-6">
          {/* Header */}
          <div className="w-full">
            <h1 className="text-3xl font-semibold mb-2">Skills</h1>
            <p className="text-muted-foreground max-w-2xl">
              Manage skill packs that extend Arion&apos;s capabilities. Skills are resolved from
              managed and bundled sources.
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
                <Upload className="h-4 w-4 mr-2" />
                {isUploadingSkill ? 'Uploading...' : 'Upload Skill'}
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
          {isSkillsLoading ? (
            <div className="w-full flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : availableSkills.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">
              {availableSkills.map((skill) => (
                <Card
                  key={`${skill.id}:${skill.source}`}
                  className="flex flex-col overflow-hidden transition-all hover:shadow-md"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{skill.name}</CardTitle>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-xs ${sourceColorMap[skill.source] || ''}`}
                      >
                        {skill.source}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs font-mono">{`$${skill.id}`}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 grow">
                    <p className="text-sm text-muted-foreground">{skill.description}</p>
                    <p className="text-xs text-muted-foreground/70 mt-3 break-all">
                      {skill.sourcePath}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="w-full text-center py-12 border border-dashed rounded-lg">
              <Boxes className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground mb-1">No skills found</p>
              <p className="text-sm text-muted-foreground">Upload a skill to get started.</p>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  )
}

export default SkillsPage
