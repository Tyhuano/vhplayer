export type SourceType = 'file' | 'url' | 'm3u8' | 'flv'

export interface MediaItem {
  id: string
  title: string
  sourceType: SourceType
  value: string
  duration?: number
  lastPosition?: number
  createdAt?: number
}

export type PlaylistSource = 'folder' | 'files' | 'url' | 'manual'

export interface Playlist {
  id: string
  name: string
  items: MediaItem[]
  createdAt: number
  /** 列表来源：folder=文件夹、files=文件选择、url=网络流、manual=手动创建 */
  source?: PlaylistSource
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
  pinned: boolean
}

export interface StoreSnapshot {
  playlists: Playlist[]
  favorites: Playlist
  settings: Settings
  instances: PlayerInstance[]
}

export const IPC = {
  windowEnterFullscreen: 'window:enter-fullscreen',
  windowExitFullscreen: 'window:exit-fullscreen',
  windowToggleFullscreen: 'window:toggle-fullscreen',
  windowEnterMini: 'window:enter-mini',
  windowExitMini: 'window:exit-mini',
  windowGetState: 'window:get-state',
  windowSetPinned: 'window:set-pinned',
  windowMoveTo: 'window:move-to',
  windowResizeTo: 'window:resize-to',
  windowMinimize: 'window:minimize',
  windowClose: 'window:close',
  dialogOpenFolder: 'dialog:open-folder',
  dialogOpenFile: 'dialog:open-file',
  dialogSave: 'dialog:save',
  storeGetAll: 'store:get-all',
  storeSaveAll: 'store:save-all',
  mediaScanFolder: 'media:scan-folder',
  mediaFromPaths: 'media:from-paths',
  appClosing: 'app:closing',
  appReadyToClose: 'app:ready-to-close'
} as const

export interface IpcApi {
  window: {
    enterFullscreen(): Promise<void>
    exitFullscreen(): Promise<void>
    toggleFullscreen(): Promise<void>
    enterMini(): Promise<void>
    exitMini(): Promise<void>
    getState(): Promise<WindowState>
    setPinned(flag: boolean): Promise<void>
    moveTo(x: number, y: number): Promise<void>
    resizeTo(x: number, y: number, width: number, height: number): Promise<void>
    minimize(): Promise<void>
    close(): Promise<void>
  }
  dialog: {
    openFolder(): Promise<string | null>
    openFile(): Promise<string[] | null>
    save(defaultName: string): Promise<string | null>
  }
  store: {
    getAll(): Promise<StoreSnapshot>
    saveAll(snapshot: StoreSnapshot): Promise<void>
  }
  media: {
    scanFolder(folder: string): Promise<MediaItem[]>
    fromPaths(paths: string[]): Promise<MediaItem[]>
  }
  app: {
    onClosing(callback: () => void): () => void
    readyToClose(): Promise<void>
  }
}
