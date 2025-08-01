import { useMemo } from 'react'
import { useLayerStore } from '@/stores/layer-store'
import { useKnowledgeBaseStore } from '@/features/knowledge-base/stores/knowledge-base-store'
import { useChatHistoryStore } from '@/stores/chat-history-store'

export interface MentionItem {
  id: string
  name: string
  type: 'layer-vector' | 'layer-raster' | 'document'
  description?: string
  tags?: string[]
}

interface UseMentionDataOptions {
  searchQuery: string
  enabled: boolean
}

export const useMentionData = ({ searchQuery, enabled }: UseMentionDataOptions) => {
  const layers = useLayerStore((state) => state.layers)
  const documents = useKnowledgeBaseStore((state) => state.documents)
  const currentChatId = useChatHistoryStore((state) => state.currentChatId)

  const mentionItems = useMemo<MentionItem[]>(() => {
    
    if (!enabled) return []

    const items: MentionItem[] = []

    // Add imported layers for current chat
    if (currentChatId) {
      const sessionLayers = Array.from(layers.values()).filter((layer) => {
        return layer.createdBy === 'import' && 
               layer.metadata.tags?.includes(currentChatId)
      })

      sessionLayers.forEach((layer) => {
        items.push({
          id: layer.id,
          name: layer.name,
          type: layer.type === 'vector' ? 'layer-vector' : 'layer-raster',
          description: layer.metadata.description,
          tags: layer.metadata.tags
        })
      })
    }

    // Add knowledge base documents
    documents.forEach((doc) => {
      items.push({
        id: doc.id,
        name: doc.name,
        type: 'document',
        description: doc.description || `${doc.fileType.toUpperCase()} file`,
        tags: []
      })
    })
    
    // Add test items for debugging if no real data
    if (items.length === 0) {
      items.push(
        {
          id: 'test-1',
          name: 'Sample Vector Layer',
          type: 'layer-vector',
          description: 'Test vector layer for mention menu',
          tags: ['test']
        },
        {
          id: 'test-2', 
          name: 'Sample Document',
          type: 'document',
          description: 'Test document for mention menu',
          tags: ['test']
        }
      )
    }

    // Filter by search query if provided
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      const filtered = items.filter((item) => {
        return item.name.toLowerCase().includes(query) ||
               item.description?.toLowerCase().includes(query) ||
               item.tags?.some(tag => tag.toLowerCase().includes(query))
      })
      return filtered
    }

    return items
  }, [layers, documents, currentChatId, searchQuery, enabled])

  const isLoading = useLayerStore((state) => state.isLoading) || 
                   useKnowledgeBaseStore((state) => state.isLoading)

  return {
    items: mentionItems,
    isLoading
  }
}