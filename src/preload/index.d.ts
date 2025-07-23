import { ElectronAPI } from '@electron-toolkit/preload'
import type { Message } from '@ai-sdk/react'

// Define the structure of the chat request body, mirroring preload script
interface ChatRequestBodyForDTS {
  messages: Message[]
  // other properties if added to ChatRequestBody in preload.ts
}

// Define the shape of our custom ctgApi
export interface CtgApi {
  settings: {
    getSetting: (key: string) => Promise<unknown>
    setSetting: (key: string, value: unknown) => Promise<{ success: boolean; error?: string }>
  }
  chat: {
    sendMessageStream: (body: ChatRequestBodyForDTS | undefined) => Promise<Uint8Array[]>
  }
  // Define other namespaces and their functions here as they are added
}

declare global {
  interface Window {
    electron: ElectronAPI
    ctg: CtgApi // Changed 'api' to 'ctg' and used the CtgApi interface
  }
}
