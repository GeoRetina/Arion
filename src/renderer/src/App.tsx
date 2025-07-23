import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import ChatInterface from './features/chat/components/chat-interface'
import MainLayout from './components/layout/main-layout'
import React, { useEffect } from 'react'
import { useLLMStore } from './stores/llm-store'
import { useChatHistoryStore } from './stores/chat-history-store'
import { ChatHistoryList } from './features/chat/components/chat-history-list'
import { initTheme } from './stores/theme-store'

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

function App(): React.JSX.Element {
  const initializeLLMStore = useLLMStore((state) => state.initializeStore)
  const isLLMStoreInitialized = useLLMStore((state) => state.isInitialized)

  // Get fetchChats action from chat history store
  const fetchChats = useChatHistoryStore((state) => state.fetchChats)

  useEffect(() => {
    if (!isLLMStoreInitialized) {
      console.log('[App.tsx] Initializing LLM store...')
      initializeLLMStore()
    }
  }, [initializeLLMStore, isLLMStoreInitialized])

  // Fetch chat history on initial app load
  useEffect(() => {
    console.log('[App.tsx] Attempting to fetch chat history...')
    fetchChats()
  }, [fetchChats])

  // Initialize theme on app load
  useEffect(() => {
    console.log('[App.tsx] Initializing theme...')
    initTheme()
  }, [])

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
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/plugins" element={<PluginsPage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
        </Routes>
      </React.Suspense>
    </MainLayout>
  )
}

// Wrapper component to access route params and pass them as key
const ChatInterfaceWrapper = () => {
  const { chatId } = useParams<{ chatId: string }>()
  return <ChatInterface key={chatId} />
}

export default App
