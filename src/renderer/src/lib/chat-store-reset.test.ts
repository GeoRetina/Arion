import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clearCurrentChat: vi.fn(),
  clearSessionDataLayer: vi.fn(),
  clearSessionDataMap: vi.fn(),
  clearChatPermissions: vi.fn(),
  resetOrchestration: vi.fn(),
  clearSessionLayersForChat: vi.fn(),
  chatPermissions: {
    chatA: { allow: true },
    chatB: { allow: false }
  } as Record<string, unknown>
}))

vi.mock('@/stores/chat-history-store', () => ({
  useChatHistoryStore: {
    getState: () => ({
      clearCurrentChat: mocks.clearCurrentChat
    })
  }
}))

vi.mock('@/stores/layer-store', () => ({
  useLayerStore: {
    getState: () => ({
      clearSessionData: mocks.clearSessionDataLayer,
      clearSessionLayersForChat: mocks.clearSessionLayersForChat
    })
  }
}))

vi.mock('@/stores/map-store', () => ({
  useMapStore: {
    getState: () => ({
      clearSessionData: mocks.clearSessionDataMap
    })
  }
}))

vi.mock('@/stores/mcp-permission-store', () => ({
  useMcpPermissionStore: {
    getState: () => ({
      chatPermissions: mocks.chatPermissions,
      clearChatPermissions: mocks.clearChatPermissions
    })
  }
}))

vi.mock('@/stores/agent-orchestration-store', () => ({
  useAgentOrchestrationStore: {
    getState: () => ({
      resetOrchestration: mocks.resetOrchestration
    })
  }
}))

import { prepareChatSwitch, resetChatStoreForChatId, resetChatStores } from './chat-store-reset'

describe('chat-store-reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resets all chat-related stores', () => {
    resetChatStores()

    expect(mocks.clearCurrentChat).toHaveBeenCalledTimes(1)
    expect(mocks.clearSessionDataLayer).toHaveBeenCalledTimes(1)
    expect(mocks.clearSessionDataMap).toHaveBeenCalledTimes(1)
    expect(mocks.resetOrchestration).toHaveBeenCalledTimes(1)
    expect(mocks.clearChatPermissions).toHaveBeenCalledWith('chatA')
    expect(mocks.clearChatPermissions).toHaveBeenCalledWith('chatB')
  })

  it('resets state for a specific chat id', () => {
    resetChatStoreForChatId('chatA')

    expect(mocks.clearChatPermissions).toHaveBeenCalledWith('chatA')
    expect(mocks.clearSessionLayersForChat).toHaveBeenCalledWith('chatA')
  })

  it('prepares chat switch by cleaning source chat and clearing current context', () => {
    prepareChatSwitch('chatA', 'chatB')

    expect(mocks.clearChatPermissions).toHaveBeenCalledWith('chatA')
    expect(mocks.clearSessionLayersForChat).toHaveBeenCalledWith('chatA')
    expect(mocks.clearCurrentChat).toHaveBeenCalledTimes(1)
  })
})
