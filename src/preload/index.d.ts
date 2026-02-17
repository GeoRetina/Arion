import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    // `ctg` is declared in src/shared/ipc-types.ts to keep a single source of truth.
  }
}

export {}
