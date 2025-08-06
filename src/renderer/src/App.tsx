import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ChatInterface from './features/chat/components/chat-interface'
import MainLayout from './components/layout/main-layout'
import React, { useEffect, useRef } from 'react'
import { useLLMStore } from './stores/llm-store'
import { useChatHistoryStore } from './stores/chat-history-store'
import { useLayerStore } from './stores/layer-store'
import { ChatHistoryList } from './features/chat/components/chat-history-list'
import { initTheme } from './stores/theme-store'
import { resetChatStores } from './lib/chat-store-reset'

// Lazy load the ModelsPage for better initial load time
const ModelsPage = React.lazy(() => import('./features/models/components/modals-page'))
const McpServersPage = React.lazy(() => import('./features/settings/components/mcp-servers-page'))
const SettingsPage = React.lazy(() => import('./features/settings/components/settings-page'))
const PluginsPage = React.lazy(() => import('./features/plugins/components/plugins-age'))
const IntegrationsPage = React.lazy(
  () => import('./features/integrations/components/integrations-page')
)
const KnowledgeBasePage = React.lazy(
  () => import('./features/knowledge-base/components/knowledge-base')
)
const AgentsPage = React.lazy(() => import('./features/agents/components/agents-page'))

function App(): React.JSX.Element {
  const initializeLLMStore = useLLMStore((state) => state.initializeStore)
  const isLLMStoreInitialized = useLLMStore((state) => state.isInitialized)
  const location = useLocation()
  const previousLocationRef = useRef<string | undefined>(undefined)

  // Get fetchChats action from chat history store
  const fetchChats = useChatHistoryStore((state) => state.fetchChats)
  
  // Get layer store actions
  const loadFromPersistence = useLayerStore((state) => state.loadFromPersistence)

  useEffect(() => {
    if (!isLLMStoreInitialized) {
      initializeLLMStore()
    }
  }, [initializeLLMStore, isLLMStoreInitialized])

  // Fetch chat history and load layers on initial app load
  useEffect(() => {
    fetchChats()
    loadFromPersistence() // Load persistent layers (excluding session imports)
  }, [fetchChats, loadFromPersistence])

  // Initialize theme on app load
  useEffect(() => {
    initTheme()
  }, [])

  // Handle route changes to reset stores when leaving chat
  useEffect(() => {
    const currentPath = location.pathname
    const previousPath = previousLocationRef.current

    // If we're leaving a chat route and going to a non-chat route
    if (previousPath && previousPath.startsWith('/chat/') && !currentPath.startsWith('/chat/')) {
      resetChatStores()
    }

    // Update the previous location reference
    previousLocationRef.current = currentPath
  }, [location.pathname])

  return (
    <MainLayout>
      <React.Suspense fallback={<div>Loading...</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/chat/new" replace />} />
          <Route path="/chat/:chatId" element={<ChatInterfaceWrapper />} />
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/mcp-servers" element={<McpServersPage />} />
          <Route path="/history" element={<ChatHistoryList />} />
          <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/plugins" element={<PluginsPage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
        </Routes>
      </React.Suspense>
    </MainLayout>
  )
}

// Wrapper component to provide ChatInterface
const ChatInterfaceWrapper = () => {
  // Removed chatId extraction and key prop to prevent component remounting during navigation
  // This ensures the map instance persists across chat sessions
  return <ChatInterface />
}

export default App
