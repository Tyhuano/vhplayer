import { create } from 'zustand'
import type { AppState, MediaItem, Playlist, PlayerInstance, Settings, StoreSnapshot } from '../../../shared/types'
import { reorderItems as reorderList, type SortMode } from './playlistUtils'

export const RATES = [0.5, 1, 1.5, 2, 3]
export const MODES: PlayerInstance['playMode'][] = ['order', 'loop', 'random']
export const MODE_LABEL: Record<PlayerInstance['playMode'], string> = { order: '顺序', loop: '循环', random: '随机' }

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

export interface AppStore extends AppState {
  panelOpen: boolean
  panelTab: 'lists' | 'favorites'
  sortMode: Record<string, SortMode>
  menuOpen: boolean
  menuX: number
  menuY: number
  urlInputOpen: boolean
  hydrate(snapshot: StoreSnapshot): void
  setViewMode(mode: 'single' | 'grid'): void
  setActiveInstance(id: number): void
  updateInstance(id: number, patch: Partial<PlayerInstance>): void
  addPlaylist(playlist: Playlist): void
  createPlaylist(name: string): string
  addItemsToPlaylist(playlistId: string, items: MediaItem[]): void
  renamePlaylist(playlistId: string, name: string): void
  removeFromPlaylist(playlistId: string, itemId: string): void
  clearPlaylist(playlistId: string): void
  updateItemLastPosition(playlistId: string, itemId: string, position: number): void
  setSettings(patch: Partial<Settings>): void
  setPlayMode(instanceId: number, mode: PlayerInstance['playMode']): void
  setRate(instanceId: number, rate: number): void
  setScaleMode(instanceId: number, mode: 'contain' | 'fill'): void
  cycleRate(instanceId: number): void
  cyclePlayMode(instanceId: number): void
  nextInInstance(instanceId: number): void
  prevInInstance(instanceId: number): void
  openPanel(): void
  closePanel(): void
  togglePanel(): void
  setPanelTab(tab: 'lists' | 'favorites'): void
  setSortMode(playlistId: string, mode: SortMode): void
  toggleFavorite(): void
  removeFromFavorites(itemId: string): void
  reorderItems(playlistId: string, from: number, to: number): void
  playItemFromList(listId: string, index: number): void
  openMenu(x: number, y: number): void
  closeMenu(): void
  openUrlInput(): void
  closeUrlInput(): void
}

export const useAppStore = create<AppStore>((set, get) => ({
  viewMode: 'single',
  activeInstance: 0,
  instances: [0, 1, 2, 3].map(emptyInstance),
  playlists: [],
  favorites: { id: 'favorites', name: '收藏', items: [], createdAt: 0 },
  settings: { downloadDir: '', autoResume: true },
  panelOpen: false,
  panelTab: 'lists',
  sortMode: {},
  menuOpen: false,
  menuX: 0,
  menuY: 0,
  urlInputOpen: false,

  hydrate: (snapshot) => {
    const fav =
      snapshot.favorites && typeof snapshot.favorites === 'object' && Array.isArray(snapshot.favorites.items)
        ? snapshot.favorites
        : get().favorites
    set({
      playlists: snapshot.playlists,
      favorites: fav,
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

  createPlaylist: (name) => {
    const id = crypto.randomUUID()
    const playlist: Playlist = { id, name: name.trim() || '新建列表', items: [], createdAt: Date.now() }
    set({ playlists: [...get().playlists, playlist] })
    schedulePersist()
    return id
  },

  addItemsToPlaylist: (playlistId, items) => {
    set({
      playlists: get().playlists.map((p) =>
        p.id === playlistId ? { ...p, items: [...p.items, ...items] } : p
      )
    })
    schedulePersist()
  },

  renamePlaylist: (playlistId, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    set({ playlists: get().playlists.map((p) => (p.id === playlistId ? { ...p, name: trimmed } : p)) })
    schedulePersist()
  },

  removeFromPlaylist: (playlistId, itemId) => {
    set({
      playlists: get().playlists.map((p) =>
        p.id === playlistId ? { ...p, items: p.items.filter((it) => it.id !== itemId) } : p
      )
    })
    schedulePersist()
  },

  clearPlaylist: (playlistId) => {
    set({ playlists: get().playlists.map((p) => (p.id === playlistId ? { ...p, items: [] } : p)) })
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

  setPlayMode: (instanceId, mode) => get().updateInstance(instanceId, { playMode: mode }),
  setRate: (instanceId, rate) => get().updateInstance(instanceId, { rate }),
  setScaleMode: (instanceId, mode) => get().updateInstance(instanceId, { scaleMode: mode }),

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
  },

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set({ panelOpen: !get().panelOpen }),
  setPanelTab: (tab) => set({ panelTab: tab }),
  setSortMode: (playlistId, mode) => set({ sortMode: { ...get().sortMode, [playlistId]: mode } }),

  toggleFavorite: () => {
    const state = get()
    const ins = state.instances[state.activeInstance]
    if (ins.playlistId === null) return
    const list = ins.playlistId === 'favorites' ? state.favorites : state.playlists.find((p) => p.id === ins.playlistId)
    const item = list?.items[ins.currentIndex]
    if (!item) return
    const exists = state.favorites.items.some((f) => f.id === item.id)
    set({
      favorites: exists
        ? { ...state.favorites, items: state.favorites.items.filter((f) => f.id !== item.id) }
        : { ...state.favorites, items: [...state.favorites.items, { ...item }] }
    })
    schedulePersist()
  },

  removeFromFavorites: (itemId) => {
    const state = get()
    set({ favorites: { ...state.favorites, items: state.favorites.items.filter((f) => f.id !== itemId) } })
    schedulePersist()
  },

  reorderItems: (playlistId, from, to) => {
    set({
      playlists: get().playlists.map((p) => (p.id === playlistId ? { ...p, items: reorderList(p.items, from, to) } : p))
    })
    schedulePersist()
  },

  playItemFromList: (listId, index) => {
    const state = get()
    const list = listId === 'favorites' ? state.favorites : state.playlists.find((p) => p.id === listId)
    if (!list || !list.items[index]) return
    get().updateInstance(state.activeInstance, { playlistId: listId, currentIndex: index, isPlaying: true })
  },

  openMenu: (x, y) => set({ menuOpen: true, menuX: x, menuY: y }),
  closeMenu: () => set({ menuOpen: false }),
  openUrlInput: () => set({ urlInputOpen: true }),
  closeUrlInput: () => set({ urlInputOpen: false })
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
