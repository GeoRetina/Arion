import type { BrowserWindow } from 'electron'

export type BrowserWindowProvider = () => BrowserWindow | null
