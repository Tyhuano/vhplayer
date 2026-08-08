import { create } from 'zustand'
import type { AppState, Playlist, PlayerInstance, Settings, StoreSnapshot } from '../../../shared/types'

function emptyInstance(id: number): PlayerInstance {
  return {
    id,
    playlistId: null,
    currentIndex: 0,
    playMode: 'order',
    isPlaying: false,
    volume: 1,
    rate: 1,
    scaleMode: 'contain'
  }
}

const RATES = [0.5, 1, 1.5, 2, 3]
const MODES: PlayerInstance['playMode'][] = ['order', 'loop', 'random']

export interface AppStore extends AppState {
  hydrate(snapshot: StoreSnapshot): void
  setViewMode(mode: 'single' | 'grid'): void
  setActiveInstance(id: number): void
  updateInstance(id: number, patch: Partial<PlayerInstance>): void
  addPlaylist(playlist: Playlist): void
  updateItemLastPosition(playlistId: string, itemId: string, position: number): void
  setSettings(patch: Partial<Settings>): void
  cycleRate(instanceId: number): void
  cyclePlayMode(instanceId: number): void
  nextInInstance(instanceId: number): void
  prevInInstance(instanceId: number): void
}

export const useAppStore = create<AppStore>((set, get) => ({
  viewMode: 'single',
  activeInstance: 0,
  instances: [0, 1, 2, 3].map(emptyInstance),
  playlists: [],
  favorites: { id: 'favorites', name: '收藏', items: [], createdAt: 0 },
  settings: { downloadDir: '', autoResume: true },

  hydrate: (snapshot) => {
    set({
      playlists: snapshot.playlists,
      favorites: snapshot.favorites,
      settings: snapshot.settings,
      instances: snapshot.instances.length === 4 ? snapshot.instances : get().instances
    })
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  setActiveInstance: (id) => set({ activeInstance: id }),

  updateInstance: (id, patch) => {
    set({
      instances: get().instances.map((ins) => (ins.id === id ? { ...ins, ...patch } : ins))
    })
    schedulePersist()
  },

  addPlaylist: (playlist) => {
    set({ playlists: [...get().playlists, playlist] })
    schedulePersist()
  },

  updateItemLastPosition: (playlistId, itemId, position) => {
    set({
      playlists: get().playlists.map((p) =>
        p.id === playlistId
          ? { ...p, items: p.items.map((it) => (it.id === itemId ? { ...it, lastPosition: position } : it)) }
          : p
      )
    })
  },

  setSettings: (patch) => {
    set({ settings: { ...get().settings, ...patch } })
    schedulePersist()
  },

  cycleRate: (instanceId) => {
    const ins = get().instances[instanceId]
    const next = RATES[(RATES.indexOf(ins.rate) + 1) % RATES.length]
    get().updateInstance(instanceId, { rate: next })
  },

  cyclePlayMode: (instanceId) => {
    const ins = get().instances[instanceId]
    const next = MODES[(MODES.indexOf(ins.playMode) + 1) % MODES.length]
    get().updateInstance(instanceId, { playMode: next })
  },

  nextInInstance: (instanceId) => {
    const ins = get().instances[instanceId]
    if (ins.playlistId === null) return
    const playlist = get().playlists.find((p) => p.id === ins.playlistId)
    if (!playlist || playlist.items.length === 0) return
    if (ins.playMode === 'random') {
      let idx = Math.floor(Math.random() * playlist.items.length)
      if (idx === ins.currentIndex && playlist.items.length > 1) idx = (idx + 1) % playlist.items.length
      get().updateInstance(instanceId, { currentIndex: idx, isPlaying: true })
      return
    }
    let nextIndex = ins.currentIndex + 1
    if (nextIndex >= playlist.items.length) {
      nextIndex = ins.playMode === 'loop' ? 0 : -1
    }
    if (nextIndex === -1) {
      get().updateInstance(instanceId, { isPlaying: false })
      return
    }
    get().updateInstance(instanceId, { currentIndex: nextIndex, isPlaying: true })
  },

  prevInInstance: (instanceId) => {
    const ins = get().instances[instanceId]
    if (ins.playlistId === null) return
    const playlist = get().playlists.find((p) => p.id === ins.playlistId)
    if (!playlist || playlist.items.length === 0) return
    const prevIndex = (ins.currentIndex - 1 + playlist.items.length) % playlist.items.length
    get().updateInstance(instanceId, { currentIndex: prevIndex, isPlaying: true })
  }
}))

let persistTimer: ReturnType<typeof setTimeout> | null = null

export function schedulePersist(): void {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    void persistNow()
  }, 5000)
}

export async function persistNow(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  const state = useAppStore.getState()
  const snapshot: StoreSnapshot = {
    playlists: state.playlists,
    favorites: state.favorites,
    settings: state.settings,
    instances: state.instances
  }
  await window.api.store.saveAll(snapshot)
}

/** 关闭前把各实例当前播放位置写入 lastPosition（单实例场景取 .player-view video） */
export function flushPositions(): void {
  const state = useAppStore.getState()
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('.player-view video'))
  for (const ins of state.instances) {
    if (ins.playlistId === null) continue
    const playlist = state.playlists.find((p) => p.id === ins.playlistId)
    const item = playlist?.items[ins.currentIndex]
    const video = videos[ins.id]
    if (item && video && Number.isFinite(video.currentTime) && video.currentTime > 0) {
      useAppStore.getState().updateItemLastPosition(ins.playlistId, item.id, video.currentTime)
    }
  }
}

/**
 * 周期兜底落盘：把当前播放位置直接写入磁盘（不更新 UI 记忆点）。
 * 覆盖"进程被强杀、close 事件未触发"的场景（最多丢一个周期内的位置）。
 */
export async function persistPositionOnly(): Promise<void> {
  const state = useAppStore.getState()
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('.player-view video'))
  const playlists = state.playlists.map((p) => ({ ...p, items: p.items.map((it) => ({ ...it })) }))
  for (const ins of state.instances) {
    if (ins.playlistId === null) continue
    const playlist = playlists.find((p) => p.id === ins.playlistId)
    const item = playlist?.items[ins.currentIndex]
    const video = videos[ins.id]
    if (item && video && Number.isFinite(video.currentTime) && video.currentTime > 2) {
      item.lastPosition = video.currentTime
    }
  }
  const snapshot: StoreSnapshot = {
    playlists,
    favorites: state.favorites,
    settings: state.settings,
    instances: state.instances
  }
  await window.api.store.saveAll(snapshot)
}
