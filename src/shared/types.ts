export type SourceType = 'file' | 'url' | 'm3u8' | 'flv'

export interface MediaItem {
  id: string
  title: string
  sourceType: SourceType
  value: string
  duration?: number
  lastPosition?: number
}

export interface Playlist {
  id: string
  name: string
  items: MediaItem[]
  createdAt: number
}

export type PlayMode = 'order' | 'loop' | 'random'

export interface PlayerInstance {
  id: number
  playlistId: string | null
  currentIndex: number
  playMode: PlayMode
  isPlaying: boolean
  volume: number
  rate: number
  scaleMode: 'contain' | 'fill'
}

export interface Settings {
  downloadDir: string
  autoResume: boolean
}

export interface AppState {
  viewMode: 'single' | 'grid'
  activeInstance: number
  instances: PlayerInstance[]
  playlists: Playlist[]
  favorites: Playlist
  settings: Settings
}

export type WindowMode = 'window' | 'fullscreen' | 'mini'

export interface WindowState {
  mode: WindowMode
  bounds: { x: number; y: number; width: number; height: number }
}

export const IPC = {
  windowEnterFullscreen: 'window:enter-fullscreen',
  windowExitFullscreen: 'window:exit-fullscreen',
  windowToggleFullscreen: 'window:toggle-fullscreen',
  windowEnterMini: 'window:enter-mini',
  windowExitMini: 'window:exit-mini',
  windowGetState: 'window:get-state',
  dialogOpenFolder: 'dialog:open-folder',
  dialogOpenFile: 'dialog:open-file',
  dialogSave: 'dialog:save'
} as const

export interface IpcApi {
  window: {
    enterFullscreen(): Promise<void>
    exitFullscreen(): Promise<void>
    toggleFullscreen(): Promise<void>
    enterMini(): Promise<void>
    exitMini(): Promise<void>
    getState(): Promise<WindowState>
  }
  dialog: {
    openFolder(): Promise<string | null>
    openFile(): Promise<string[] | null>
    save(defaultName: string): Promise<string | null>
  }
}
