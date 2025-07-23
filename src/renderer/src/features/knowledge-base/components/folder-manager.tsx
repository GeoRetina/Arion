import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Folder as FolderIcon, Plus, Edit, Trash, Home } from 'lucide-react'
import { Folder } from '../stores/knowledge-base-store'
import { formatRelativeTime } from '../utils/format-utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface FolderManagerProps {
  folders: Folder[]
  currentFolderId?: string
  onFolderSelect: (folderId?: string) => void
  onAddFolder: () => void
  onEditFolder: (folder: Folder) => void
  onDeleteFolder: (folder: Folder) => void
}

export function FolderManager({
  folders,
  currentFolderId,
  onFolderSelect,
  onAddFolder,
  onEditFolder,
  onDeleteFolder
}: FolderManagerProps): React.JSX.Element {
  return (
    <Card className="h-full">
      <CardHeader className="py-2 px-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-md font-medium">Folders</CardTitle>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={onAddFolder}>
                <Plus className="h-4 w-4" />
                <span className="sr-only">Add folder</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Add new folder</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent className="pt-0 pb-1 px-0">
        <ScrollArea className="h-[calc(100vh-250px)]">
          <div className="p-2 space-y-1">
            <Button
              variant={!currentFolderId ? 'secondary' : 'ghost'}
              className="w-full justify-start font-normal px-3 py-1.5 h-auto text-sm mb-2"
              onClick={() => onFolderSelect(undefined)}
            >
              <Home className="mr-2 h-4 w-4 shrink-0" />
              All Documents
            </Button>

            {folders.map((folder) => (
              <div
                key={folder.id}
                className={`flex items-center justify-between group rounded-md pr-2 pl-3 py-1.5 cursor-pointer transition-colors duration-150
                  ${
                    currentFolderId === folder.id
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-card-foreground hover:bg-muted/60'
                  }`}
                onClick={() => onFolderSelect(folder.id)}
              >
                <div className="flex items-center flex-grow overflow-hidden mr-2">
                  <FolderIcon className="mr-3 h-4 w-4 shrink-0" />
                  <div className="flex flex-col items-start overflow-hidden">
                    <span className="truncate text-sm font-medium max-w-[150px]">
                      {folder.name}
                    </span>
                    <span className="text-xs opacity-80">
                      {formatRelativeTime(folder.updatedAt)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-1 shrink-0">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-md focus-visible:ring-0 focus-visible:ring-offset-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditFolder(folder)
                          }}
                        >
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Edit folder</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-md hover:text-destructive hover:bg-destructive/[.07] dark:hover:bg-destructive/[.07] focus-visible:ring-0 focus-visible:ring-offset-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteFolder(folder)
                          }}
                        >
                          <Trash className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete folder</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
