import type { Playlist, PlayerInstance, Settings } from '../shared/types'

export interface StoreBackend {
  get(key: string): unknown
  set(key: string, value: unknown): void
  delete(key: string): void
  has(key: string): boolean
}

export function createMemoryBackend(): StoreBackend {
  const map = new Map<string, unknown>()
  return {
    get: (key) => map.get(key),
    set: (key, value) => {
      map.set(key, value)
    },
    delete: (key) => {
      map.delete(key)
    },
    has: (key) => map.has(key)
  }
}

export function createElectronStoreBackend(cwd?: string): StoreBackend {
  const Store = require('electron-store') as new (opts?: { cwd?: string }) => {
    get(key: string): unknown
    set(key: string, value: unknown): void
    delete(key: string): void
    has(key: string): boolean
  }
  // cwd 指定时把 config.json 写入该目录（打包版为安装目录旁 data/）
  const store = new Store(cwd ? { cwd } : {})
  return {
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
    delete: (key) => store.delete(key),
    has: (key) => store.has(key)
  }
}

const DEFAULT_SETTINGS: Settings = { downloadDir: '', autoResume: true }

export interface StoreSnapshot {
  playlists: Playlist[]
  favorites: Playlist
  settings: Settings
  instances: PlayerInstance[]
}

function defaultInstances(): PlayerInstance[] {
  return [0, 1, 2, 3].map(
    (id): PlayerInstance => ({
      id,
      playlistId: null,
      currentIndex: 0,
      playMode: 'order',
      isPlaying: false,
      volume: 1,
      rate: 1,
      scaleMode: 'contain'
    })
  )
}

export class StoreService {
  constructor(private readonly backend: StoreBackend) {}

  getPlaylists(): Playlist[] {
    const v = this.backend.get('playlists')
    return Array.isArray(v) ? (v as Playlist[]) : []
  }

  savePlaylists(playlists: Playlist[]): void {
    this.backend.set('playlists', playlists)
  }

  getFavorites(): Playlist {
    const v = this.backend.get('favorites')
    if (v && typeof v === 'object') return v as Playlist
    return { id: 'favorites', name: '收藏', items: [], createdAt: Date.now() }
  }

  saveFavorites(favorites: Playlist): void {
    this.backend.set('favorites', favorites)
  }

  getSettings(): Settings {
    const v = this.backend.get('settings')
    if (v && typeof v === 'object') return { ...DEFAULT_SETTINGS, ...(v as Partial<Settings>) }
    return { ...DEFAULT_SETTINGS }
  }

  saveSettings(settings: Settings): void {
    this.backend.set('settings', settings)
  }

  getInstances(): PlayerInstance[] {
    const v = this.backend.get('instances')
    if (Array.isArray(v)) {
      const list = v as PlayerInstance[]
      if (list.length === 4) return list
    }
    return defaultInstances()
  }

  saveInstances(instances: PlayerInstance[]): void {
    this.backend.set('instances', instances)
  }

  getAll(): StoreSnapshot {
    return {
      playlists: this.getPlaylists(),
      favorites: this.getFavorites(),
      settings: this.getSettings(),
      instances: this.getInstances()
    }
  }

  saveAll(snapshot: StoreSnapshot): void {
    this.savePlaylists(snapshot.playlists)
    this.saveFavorites(snapshot.favorites)
    this.saveSettings(snapshot.settings)
    this.saveInstances(snapshot.instances)
  }
}
