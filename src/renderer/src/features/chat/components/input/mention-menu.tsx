import React, { useEffect, useRef } from 'react'
import { ChevronRight, Database, FileText, Image, Map } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MentionItem {
  id: string
  name: string
  type: 'layer-vector' | 'layer-raster' | 'document'
  description?: string
  tags?: string[]
}

interface MentionMenuProps {
  items: MentionItem[]
  isVisible: boolean
  position: { x: number; y: number }
  selectedIndex: number
  onSelect: (item: MentionItem) => void
  onClose: () => void
  searchQuery: string
}

const getIconForType = (type: MentionItem['type']) => {
  switch (type) {
    case 'layer-vector':
      return <Map className="h-4 w-4 text-blue-500" />
    case 'layer-raster':
      return <Image className="h-4 w-4 text-green-500" />
    case 'document':
      return <FileText className="h-4 w-4 text-orange-500" />
  }
}

const getTypeLabel = (type: MentionItem['type']): string => {
  switch (type) {
    case 'layer-vector':
      return 'Vector Layer'
    case 'layer-raster':
      return 'Raster Layer'
    case 'document':
      return 'Document'
  }
}

export const MentionMenu: React.FC<MentionMenuProps> = ({
  items,
  isVisible,
  position,
  selectedIndex,
  onSelect,
  onClose,
  searchQuery
}) => {
  const menuRef = useRef<HTMLDivElement>(null)
  
  console.log('MentionMenu render:', { isVisible, items: items.length, position, searchQuery })

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isVisible, onClose])

  if (!isVisible || items.length === 0) {
    return null
  }

  const handleItemClick = (item: MentionItem) => {
    onSelect(item)
  }

  return (
    <div
      ref={menuRef}
      className="absolute z-50 w-80 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg shadow-lg max-h-60 overflow-y-auto"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <div className="p-2 border-b border-stone-200 dark:border-stone-700">
        <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-400">
          <Database className="h-3 w-3" />
          {searchQuery ? `Results for "${searchQuery}"` : 'Available data sources'}
        </div>
      </div>
      
      <div className="py-1">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              'flex items-center gap-3 px-3 py-2 mx-1 rounded cursor-pointer transition-colors',
              index === selectedIndex
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'hover:bg-stone-100 dark:hover:bg-stone-700'
            )}
            onClick={() => handleItemClick(item)}
          >
            <div className="flex-shrink-0">
              {getIconForType(item.type)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">
                  {item.name}
                </span>
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  {getTypeLabel(item.type)}
                </span>
              </div>
              
              {item.description && (
                <div className="text-xs text-stone-600 dark:text-stone-400 truncate">
                  {item.description}
                </div>
              )}
              
              {item.tags && item.tags.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {item.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="inline-block px-1.5 py-0.5 text-xs bg-stone-200 dark:bg-stone-600 text-stone-600 dark:text-stone-300 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                  {item.tags.length > 2 && (
                    <span className="text-xs text-stone-500">
                      +{item.tags.length - 2}
                    </span>
                  )}
                </div>
              )}
            </div>
            
            <ChevronRight className="h-3 w-3 text-stone-400" />
          </div>
        ))}
      </div>
      
      {items.length === 0 && (
        <div className="p-4 text-center text-sm text-stone-500 dark:text-stone-400">
          No data sources found
          {searchQuery && (
            <div className="text-xs mt-1">
              Try a different search term
            </div>
          )}
        </div>
      )}
    </div>
  )
}