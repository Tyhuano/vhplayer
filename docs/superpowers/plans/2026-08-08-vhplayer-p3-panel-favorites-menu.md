# VHplayer P3：侧滑面板 + 收藏 + 右键菜单实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付侧滑面板（播放列表/收藏双 tab、拖拽排序、三种排序、删除/清空）、收藏功能（爱心按钮 + 右键菜单、去重、持久化）、全自定义右键菜单（定位翻转、置灰项、子菜单打勾、Esc 优先级链）、画面缩放 contain/fill。

**Architecture:** 全渲染进程自研组件（方案 A，已确认）：ContextMenu/SidePanel 为 React 组件，UI 状态进 Zustand（不落盘）；排序/重排抽为纯函数（playlistUtils.ts，TDD）；打开文件/文件夹/网络流逻辑从 PlayerView 抽为共享模块（openMedia.ts）；主进程零改动。

**Tech Stack:** React 19 + Zustand 5 + Jest(jsdom) + react-dom/test-utils + createRoot（沿用 P2 模式，不新增任何依赖）

**前置依赖:** P1/P2 已完成（39 用例全绿）。权威 spec：`docs/superpowers/specs/2026-08-08-vhplayer-p3-panel-favorites-menu-design.md`（用户已确认）。

---

## 轻量资源约束（延续 P1/P2 硬性要求）

1. 零新增依赖（含 devDependencies）；不引入 dnd 库、不引入 UI 组件库。
2. 面板/菜单 UI 状态（`panelOpen`/`panelTab`/`sortMode`/`menuOpen`/`menuX`/`menuY`/`urlInputOpen`）**不纳入 StoreSnapshot 持久化**。
3. 收藏项为引用复制（`{ ...item }`），按 `item.id` 去重。
4. 排序（`sortItems`）只影响展示顺序，**不改写 items 原顺序**；拖拽排序写回 items。
5. 主进程零改动。
6. 既有 39 用例保持全绿。

---

## 文件结构（本计划最终交付）

```
src/
├── shared/
│   ├── types.ts                   修改：MediaItem.createdAt?: number
│   └── source.ts                  修改：mediaItemFromPath/Url 写入 createdAt
tests/setup.ts                     修改：mock window.api（避免测试触发持久化时报错）
src/renderer/src/
├── store/
│   ├── playlistUtils.ts           新增：reorderItems/sortItems 纯函数（TDD）
│   ├── __tests__/playlistUtils.test.ts    新增
│   ├── __tests__/appStoreActions.test.ts  新增（store actions TDD）
│   ├── openMedia.ts               新增：共享打开逻辑（openFiles/openFolder/openUrl/openUrlInput）
│   └── appStore.ts                修改：UI 状态 + 收藏/排序/重排/播放/面板/菜单 actions
├── components/
│   ├── ContextMenu.tsx            新增：右键菜单（TDD）
│   ├── SidePanel.tsx              新增：侧滑面板（TDD）
│   ├── __tests__/ContextMenu.test.tsx  新增
│   ├── __tests__/SidePanel.test.tsx    新增
│   ├── PlayerView.tsx             修改：scaleMode→object-fit、「列表」按钮、打开逻辑改用 openMedia、urlInput 状态入 store
│   ├── ControlsBar.tsx            修改：爱心收藏按钮、MODE_LABEL 改 import
│   └── UrlInputOverlay.tsx        不改（仍由 PlayerView 持有）
├── hooks/useShortcuts.ts          修改：L 开面板、Esc 优先级链（菜单→面板→全屏/置顶）、全局 onContextMenu
├── App.tsx                        修改：接入 SidePanel/ContextMenu
└── styles.css                     修改：面板/菜单/爱心/排序按钮样式
```

---

## Task 1: 数据层 createdAt

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/source.ts`
- Test: `src/main/__tests__/source.test.ts`

- [ ] **Step 1: 修改 src/shared/types.ts**（MediaItem 增加 createdAt）

```ts
export interface MediaItem {
  id: string
  title: string
  sourceType: SourceType
  value: string
  duration?: number
  lastPosition?: number
  createdAt?: number
}
```

- [ ] **Step 2: 修改 src/shared/source.ts**（两个工厂函数写入 createdAt）

```ts
export function mediaItemFromPath(path: string): MediaItem {
  return { id: uid(), title: titleFromPath(path), sourceType: guessSourceType(path), value: path, createdAt: Date.now() }
}

export function mediaItemFromUrl(url: string): MediaItem {
  return { id: uid(), title: url, sourceType: guessSourceType(url), value: url, createdAt: Date.now() }
}
```

- [ ] **Step 3: 在 src/main/__tests__/source.test.ts 追加用例**

```ts
  it('mediaItemFromPath/Url 写入 createdAt', () => {
    const before = Date.now()
    const item = mediaItemFromPath('C:\\v\\a.mp4')
    expect(item.createdAt).toBeDefined()
    expect(item.createdAt!).toBeGreaterThanOrEqual(before)
    expect(item.createdAt!).toBeLessThanOrEqual(Date.now())
    expect(mediaItemFromUrl('https://x.com/v.mp4').createdAt).toBeDefined()
  })
```

（同时把 `mediaItemFromPath`、`mediaItemFromUrl` 加入文件顶部 import 列表。）

- [ ] **Step 4: 运行确认通过**

```bash
npx jest src/main/__tests__/source.test.ts
```

预期：PASS，7 个用例。

- [ ] **Step 5: 提交**

```bash
git add src/shared/types.ts src/shared/source.ts src/main/__tests__/source.test.ts
git commit -m "feat: MediaItem.createdAt 与工厂函数写入"
```

---

## Task 2: 列表工具纯函数（TDD）

**Files:**
- Test: `src/renderer/src/store/__tests__/playlistUtils.test.ts`（新增）
- Create: `src/renderer/src/store/playlistUtils.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { reorderItems, sortItems, type SortMode } from '../playlistUtils'
import type { MediaItem } from '../../../../shared/types'

function item(id: string, title: string, createdAt?: number): MediaItem {
  return { id, title, sourceType: 'file', value: `C:\\v\\${id}.mp4`, createdAt }
}

const list: MediaItem[] = [item('a', '甲', 3), item('b', '乙', 1), item('c', '丙', 2)]

describe('playlistUtils', () => {
  describe('reorderItems', () => {
    it('首项拖到末尾', () => {
      expect(reorderItems(list, 0, 2).map((i) => i.id)).toEqual(['b', 'c', 'a'])
    })

    it('末尾项拖到首位', () => {
      expect(reorderItems(list, 2, 0).map((i) => i.id)).toEqual(['c', 'a', 'b'])
    })

    it('相邻移动', () => {
      expect(reorderItems(list, 0, 1).map((i) => i.id)).toEqual(['b', 'a', 'c'])
    })

    it('越界或相同位置返回原数组（不修改）', () => {
      expect(reorderItems(list, 0, 0)).toBe(list)
      expect(reorderItems(list, -1, 2)).toBe(list)
      expect(reorderItems(list, 0, 99)).toBe(list)
    })
  })

  describe('sortItems', () => {
    it('按名称排序（不修改原数组）', () => {
      const out = sortItems(list, 'name')
      expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c'])
      expect(list.map((i) => i.id)).toEqual(['a', 'b', 'c'])
      expect(out).not.toBe(list)
    })

    it('按时间正序', () => {
      expect(sortItems(list, 'timeAsc').map((i) => i.id)).toEqual(['b', 'c', 'a'])
    })

    it('按时间倒序', () => {
      expect(sortItems(list, 'timeDesc').map((i) => i.id)).toEqual(['a', 'c', 'b'])
    })

    it('createdAt 缺失回退 0（视为最旧）', () => {
      const withMissing: MediaItem[] = [item('m1', 'x', 100), item('m2', 'y')]
      expect(sortItems(withMissing, 'timeAsc').map((i) => i.id)).toEqual(['m2', 'm1'])
    })
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx jest src/renderer/src/store/__tests__/playlistUtils.test.ts
```

预期：FAIL（Cannot find module '../playlistUtils'）。

- [ ] **Step 3: 实现 src/renderer/src/store/playlistUtils.ts**

```ts
import type { MediaItem } from '../../../shared/types'

export type SortMode = 'name' | 'timeAsc' | 'timeDesc'

export function reorderItems(items: MediaItem[], from: number, to: number): MediaItem[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function sortItems(items: MediaItem[], mode: SortMode): MediaItem[] {
  const next = [...items]
  switch (mode) {
    case 'name':
      return next.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
    case 'timeAsc':
      return next.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    case 'timeDesc':
      return next.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    default:
      return next
  }
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx jest src/renderer/src/store/__tests__/playlistUtils.test.ts
```

预期：PASS，8 个用例。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/store/playlistUtils.ts src/renderer/src/store/__tests__/playlistUtils.test.ts
git commit -m "feat: 列表工具纯函数（重排/三种排序）"
```

---

## Task 3: store actions（TDD）+ 测试环境 window.api mock

**Files:**
- Modify: `tests/setup.ts`
- Modify: `src/renderer/src/store/appStore.ts`
- Test: `src/renderer/src/store/__tests__/appStoreActions.test.ts`（新增）

- [ ] **Step 1: 修改 tests/setup.ts**（mock window.api，防止 schedulePersist 5s 后触发真实持久化报错）

```ts
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: jest.fn(() => Promise.resolve())
})
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: jest.fn()
})
Object.defineProperty(HTMLMediaElement.prototype, 'load', {
  configurable: true,
  value: jest.fn()
})
Object.defineProperty(HTMLMediaElement.prototype, 'canPlayType', {
  configurable: true,
  value: jest.fn(() => 'maybe')
})
Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
  configurable: true,
  get: () => 0,
  set: () => {}
})

Object.defineProperty(window, 'api', {
  configurable: true,
  value: {
    window: {
      enterFullscreen: jest.fn(),
      exitFullscreen: jest.fn(),
      toggleFullscreen: jest.fn(),
      enterMini: jest.fn(),
      exitMini: jest.fn(),
      getState: jest.fn(() => Promise.resolve({ mode: 'window', bounds: { x: 0, y: 0, width: 960, height: 540 } }))
    },
    dialog: { openFolder: jest.fn(), openFile: jest.fn(), save: jest.fn() },
    store: { getAll: jest.fn(), saveAll: jest.fn(() => Promise.resolve()) },
    media: { scanFolder: jest.fn(() => Promise.resolve([])) },
    app: { onClosing: jest.fn(() => () => {}), readyToClose: jest.fn(() => Promise.resolve()) }
  }
})
```

- [ ] **Step 2: 写失败测试 src/renderer/src/store/__tests__/appStoreActions.test.ts**

```ts
import { useAppStore } from '../appStore'
import type { Playlist, StoreSnapshot } from '../../../../shared/types'

function makeSnapshot(over: Partial<StoreSnapshot> = {}): StoreSnapshot {
  return {
    playlists: [{ id: 'p1', name: '列表', items: [{ id: 'm1', title: '一', sourceType: 'file', value: 'C:\\a.mp4' }], createdAt: 1 }],
    favorites: { id: 'favorites', name: '收藏', items: [], createdAt: 0 },
    settings: { downloadDir: '', autoResume: true },
    instances: [0, 1, 2, 3].map((id) => ({
      id,
      playlistId: null,
      currentIndex: 0,
      playMode: 'order' as const,
      isPlaying: false,
      volume: 1,
      rate: 1,
      scaleMode: 'contain' as const
    })),
    ...over
  }
}

describe('appStore actions', () => {
  beforeEach(() => {
    useAppStore.setState({
      ...makeSnapshot(),
      panelOpen: false,
      panelTab: 'lists',
      sortMode: {},
      menuOpen: false,
      menuX: 0,
      menuY: 0,
      urlInputOpen: false
    })
  })

  it('toggleFavorite 收藏当前播放项（引用复制）', () => {
    useAppStore.getState().updateInstance(0, { playlistId: 'p1', currentIndex: 0 })
    useAppStore.getState().toggleFavorite()
    const favs = useAppStore.getState().favorites.items
    expect(favs).toHaveLength(1)
    expect(favs[0].id).toBe('m1')
  })

  it('toggleFavorite 重复收藏去重（按 item.id）', () => {
    useAppStore.getState().updateInstance(0, { playlistId: 'p1', currentIndex: 0 })
    useAppStore.getState().toggleFavorite()
    useAppStore.getState().toggleFavorite()
    expect(useAppStore.getState().favorites.items).toHaveLength(1)
  })

  it('toggleFavorite 再点一次取消收藏', () => {
    useAppStore.getState().updateInstance(0, { playlistId: 'p1', currentIndex: 0 })
    useAppStore.getState().toggleFavorite()
    useAppStore.getState().toggleFavorite()
    expect(useAppStore.getState().favorites.items).toHaveLength(0)
  })

  it('无播放项时 toggleFavorite no-op', () => {
    const before = useAppStore.getState().favorites
    useAppStore.getState().toggleFavorite()
    expect(useAppStore.getState().favorites).toBe(before)
  })

  it('removeFromFavorites 移除单项', () => {
    useAppStore.getState().updateInstance(0, { playlistId: 'p1', currentIndex: 0 })
    useAppStore.getState().toggleFavorite()
    useAppStore.getState().removeFromFavorites('m1')
    expect(useAppStore.getState().favorites.items).toHaveLength(0)
  })

  it('reorderItems 写回播放列表顺序', () => {
    const p1: Playlist = {
      id: 'p1',
      name: '列表',
      items: [
        { id: 'm1', title: '一', sourceType: 'file', value: 'C:\\a.mp4' },
        { id: 'm2', title: '二', sourceType: 'file', value: 'C:\\b.mp4' },
        { id: 'm3', title: '三', sourceType: 'file', value: 'C:\\c.mp4' }
      ],
      createdAt: 1
    }
    useAppStore.setState({ playlists: [p1] })
    useAppStore.getState().reorderItems('p1', 0, 2)
    expect(useAppStore.getState().playlists[0].items.map((i) => i.id)).toEqual(['m2', 'm3', 'm1'])
  })

  it('setSortMode 记录内存态排序方式', () => {
    useAppStore.getState().setSortMode('p1', 'timeDesc')
    expect(useAppStore.getState().sortMode['p1']).toBe('timeDesc')
  })

  it('playItemFromList 更新活动实例', () => {
    useAppStore.getState().playItemFromList('p1', 0)
    const ins = useAppStore.getState().instances[0]
    expect(ins.playlistId).toBe('p1')
    expect(ins.currentIndex).toBe(0)
    expect(ins.isPlaying).toBe(true)
  })

  it('setScaleMode / setPlayMode / setRate 直设', () => {
    useAppStore.getState().setScaleMode(0, 'fill')
    useAppStore.getState().setPlayMode(0, 'random')
    useAppStore.getState().setRate(0, 2)
    const ins = useAppStore.getState().instances[0]
    expect(ins.scaleMode).toBe('fill')
    expect(ins.playMode).toBe('random')
    expect(ins.rate).toBe(2)
  })

  it('面板/菜单/网络流输入开关', () => {
    const s = useAppStore.getState()
    s.openPanel()
    expect(useAppStore.getState().panelOpen).toBe(true)
    s.setPanelTab('favorites')
    s.togglePanel()
    expect(useAppStore.getState().panelOpen).toBe(false)
    s.openMenu(10, 20)
    expect(useAppStore.getState().menuOpen).toBe(true)
    expect(useAppStore.getState().menuX).toBe(10)
    s.closeMenu()
    expect(useAppStore.getState().menuOpen).toBe(false)
    s.openUrlInput()
    expect(useAppStore.getState().urlInputOpen).toBe(true)
    s.closeUrlInput()
    expect(useAppStore.getState().urlInputOpen).toBe(false)
  })

  it('hydrate 时收藏夹损坏兜底为空收藏夹', () => {
    useAppStore.getState().hydrate({ ...makeSnapshot(), favorites: null as unknown as never })
    expect(useAppStore.getState().favorites).toEqual({ id: 'favorites', name: '收藏', items: [], createdAt: 0 })
  })

  it('removeFromPlaylist / clearPlaylist', () => {
    useAppStore.getState().removeFromPlaylist('p1', 'm1')
    expect(useAppStore.getState().playlists[0].items).toHaveLength(0)
    useAppStore.getState().clearPlaylist('p1')
    expect(useAppStore.getState().playlists[0].items).toHaveLength(0)
  })
})
```

- [ ] **Step 3: 运行确认失败**

```bash
npx jest src/renderer/src/store/__tests__/appStoreActions.test.ts
```

预期：FAIL（appStore 尚无相关字段/action）。

- [ ] **Step 4: 重写 src/renderer/src/store/appStore.ts**

```ts
import { create } from 'zustand'
import type { AppState, Playlist, PlayerInstance, Settings, StoreSnapshot } from '../../../shared/types'
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
```

- [ ] **Step 5: 运行确认通过**

```bash
npx jest src/renderer/src/store/__tests__/appStoreActions.test.ts
npm run typecheck
```

预期：新测试 13 个用例全 PASS；typecheck 无报错（确认既有 39 用例后续全量再验）。

- [ ] **Step 6: 提交**

```bash
git add tests/setup.ts src/renderer/src/store/appStore.ts src/renderer/src/store/__tests__/appStoreActions.test.ts
git commit -m "feat: 面板/收藏/菜单/播放 store actions（含收藏去重与 hydrate 兜底）"
```

---

## Task 4: 共享打开逻辑 + PlayerView 改造

**Files:**
- Create: `src/renderer/src/store/openMedia.ts`
- Modify: `src/renderer/src/components/PlayerView.tsx`

- [ ] **Step 1: 创建 src/renderer/src/store/openMedia.ts**（从 PlayerView 抽出共享打开逻辑）

```ts
import { mediaItemFromPath, mediaItemFromUrl } from '../../../shared/source'
import type { Playlist } from '../../../shared/types'
import { useAppStore } from './appStore'

export async function openFiles(instanceId: number): Promise<void> {
  const paths = await window.api.dialog.openFile()
  if (!paths || paths.length === 0) return
  const items = paths.map(mediaItemFromPath)
  const playlist: Playlist = { id: crypto.randomUUID(), name: items[0].title, items, createdAt: Date.now() }
  useAppStore.getState().addPlaylist(playlist)
  useAppStore.getState().updateInstance(instanceId, { playlistId: playlist.id, currentIndex: 0, isPlaying: true })
}

export async function openFolder(instanceId: number): Promise<void> {
  const folder = await window.api.dialog.openFolder()
  if (!folder) return
  const items = await window.api.media.scanFolder(folder)
  if (items.length === 0) return
  const playlist: Playlist = { id: crypto.randomUUID(), name: items[0].title, items, createdAt: Date.now() }
  useAppStore.getState().addPlaylist(playlist)
  useAppStore.getState().updateInstance(instanceId, { playlistId: playlist.id, currentIndex: 0, isPlaying: true })
}

export function openUrl(instanceId: number, url: string): void {
  const item = mediaItemFromUrl(url.trim())
  const playlist: Playlist = { id: crypto.randomUUID(), name: item.title, items: [item], createdAt: Date.now() }
  useAppStore.getState().addPlaylist(playlist)
  useAppStore.getState().updateInstance(instanceId, { playlistId: playlist.id, currentIndex: 0, isPlaying: true })
}

export function openUrlInput(): void {
  useAppStore.getState().openUrlInput()
}
```

- [ ] **Step 2: 修改 src/renderer/src/components/PlayerView.tsx**

整体改动（替换文件内容，仅保留记忆续播相关逻辑不变）：

```tsx
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { persistNow, schedulePersist } from '../store/appStore'
import { PlayerCore, type PlayerErrorKind } from '../player/playerCore'
import { useAutoHide } from '../hooks/useAutoHide'
import { openFiles, openFolder, openUrl, openUrlInput } from '../store/openMedia'
import ControlsBar from './ControlsBar'
import UrlInputOverlay from './UrlInputOverlay'

interface PlayerViewProps {
  instanceId: number
}

export default function PlayerView({ instanceId }: PlayerViewProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const coreRef = useRef<PlayerCore | null>(null)
  const [error, setError] = useState<{ kind: PlayerErrorKind; message: string } | null>(null)

  const instance = useAppStore((s) => s.instances[instanceId])
  const playlists = useAppStore((s) => s.playlists)
  const settings = useAppStore((s) => s.settings)
  const urlInputOpen = useAppStore((s) => s.urlInputOpen)
  const { visible, onMouseMove, onMouseEnter, onMouseLeave } = useAutoHide()

  const playlist = playlists.find((p) => p.id === instance.playlistId) ?? null
  const currentItem = playlist?.items[instance.currentIndex] ?? null

  const prevItemRef = useRef<{ playlistId: string; itemId: string } | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const core = new PlayerCore(video, {
      onPlaying: () => useAppStore.getState().updateInstance(instanceId, { isPlaying: true }),
      onPaused: () => useAppStore.getState().updateInstance(instanceId, { isPlaying: false }),
      onEnded: () => useAppStore.getState().nextInInstance(instanceId),
      onError: (kind, message) => setError({ kind, message })
    })
    coreRef.current = core
    return () => {
      core.destroy()
      coreRef.current = null
    }
  }, [instanceId])

  useEffect(() => {
    const core = coreRef.current
    if (!core || !currentItem) return
    setError(null)
    // 离开上一个视频时快照其退出位置（关闭时由 flushPositions 兜底）
    const video = videoRef.current
    const prev = prevItemRef.current
    if (prev && video && video.currentTime > 2) {
      useAppStore.getState().updateItemLastPosition(prev.playlistId, prev.itemId, video.currentTime)
      schedulePersist()
    }
    prevItemRef.current = instance.playlistId ? { playlistId: instance.playlistId, itemId: currentItem.id } : null
    void (async () => {
      await core.load(currentItem)
      core.setVolume(instance.volume)
      core.setRate(instance.rate)
      if (instance.isPlaying) core.play()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.id, instance.playlistId])

  useEffect(() => {
    coreRef.current?.setVolume(instance.volume)
  }, [instance.volume])

  useEffect(() => {
    coreRef.current?.setRate(instance.rate)
  }, [instance.rate])

  useEffect(() => {
    if (!currentItem || !settings.autoResume) return
    const video = videoRef.current
    if (!video) return
    const onMeta = (): void => {
      const skipThreshold = Math.min(3, video.duration * 0.2)
      const pos = currentItem.lastPosition
      if (pos && pos >= 2 && pos < video.duration - skipThreshold) {
        video.currentTime = pos
        // 等 seek 真正完成后再消费记忆点（避免加载途中误清除）
        const onSeeked = (): void => {
          video.removeEventListener('seeked', onSeeked)
          if (instance.playlistId) {
            useAppStore.getState().updateItemLastPosition(instance.playlistId, currentItem.id, 0)
            schedulePersist()
          }
        }
        video.addEventListener('seeked', onSeeked)
      }
      video.removeEventListener('loadedmetadata', onMeta)
    }
    video.addEventListener('loadedmetadata', onMeta)
    return () => video.removeEventListener('loadedmetadata', onMeta)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.id, settings.autoResume])

  const handleToggleMini = async (): Promise<void> => {
    const state = await window.api.window.getState()
    if (state.mode === 'mini') await window.api.window.exitMini()
    else await window.api.window.enterMini()
  }

  const retry = (): void => {
    const core = coreRef.current
    const item = currentItem
    if (!core || !item) return
    setError(null)
    void (async () => {
      await core.load(item)
      core.play()
    })()
  }

  return (
    <div className="player-view" onMouseMove={onMouseMove} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <video ref={videoRef} className="player-video" style={{ objectFit: instance.scaleMode }} playsInline />
      <div className="player-title">{currentItem?.title ?? 'VHplayer'}</div>
      <div className="player-actions">
        <button title="打开文件" onClick={() => void openFiles(instanceId)}>
          打开
        </button>
        <button title="打开文件夹" onClick={() => void openFolder(instanceId)}>
          文件夹
        </button>
        <button title="打开网络流" onClick={openUrlInput}>
          网络流
        </button>
        <button title="播放列表" onClick={() => useAppStore.getState().togglePanel()}>
          列表
        </button>
        <button title="置顶小窗" onClick={() => void handleToggleMini()}>
          置顶
        </button>
        <button title="全屏" onClick={() => void window.api.window.toggleFullscreen()}>
          全屏
        </button>
      </div>
      {error && (
        <div className="error-overlay" onClick={() => setError(null)}>
          <div className="error-text">
            播放失败（{error.kind === 'unsupported' ? '格式不支持' : error.kind === 'network' ? '网络错误' : '致命错误'}）
          </div>
          <div className="error-detail">{error.message}</div>
          <div className="error-actions" onClick={(e) => e.stopPropagation()}>
            <button onClick={retry}>重试</button>
            <button onClick={() => useAppStore.getState().nextInInstance(instanceId)}>下一项</button>
            <button onClick={() => setError(null)}>关闭</button>
          </div>
        </div>
      )}
      <ControlsBar instanceId={instanceId} visible={visible} />
      {urlInputOpen && (
        <UrlInputOverlay
          onCancel={() => useAppStore.getState().closeUrlInput()}
          onConfirm={(url) => openUrl(instanceId, url)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: 验证**

```bash
npm run typecheck
npx jest src/renderer/src/components/__tests__/playerViewResume.test.tsx
```

预期：typecheck 无报错；PlayerView 记忆续播既有测试仍 PASS。

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/store/openMedia.ts src/renderer/src/components/PlayerView.tsx
git commit -m "feat: 共享打开逻辑 + PlayerView 接入（scaleMode/列表按钮/urlInput 入 store）"
```

---

## Task 5: 右键菜单 ContextMenu（TDD）

**Files:**
- Test: `src/renderer/src/components/__tests__/ContextMenu.test.tsx`（新增）
- Create: `src/renderer/src/components/ContextMenu.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import ContextMenu, { clampMenuPosition } from '../ContextMenu'
import { useAppStore } from '../../store/appStore'
import type { Playlist } from '../../../../shared/types'

function p1(): Playlist {
  return {
    id: 'p1',
    name: '列表',
    items: [
      { id: 'm1', title: '一', sourceType: 'file', value: 'C:\\a.mp4' },
      { id: 'm2', title: '二', sourceType: 'file', value: 'C:\\b.mp4' }
    ],
    createdAt: 1
  }
}

describe('clampMenuPosition', () => {
  it('不越界时保持原位置', () => {
    expect(clampMenuPosition(100, 60, 200, 300, 1024, 768)).toEqual({ x: 100, y: 60 })
  })

  it('右边缘不足时向左翻转', () => {
    expect(clampMenuPosition(900, 60, 200, 300, 1024, 768)).toEqual({ x: 820, y: 60 })
  })

  it('下边缘不足时向上翻转', () => {
    expect(clampMenuPosition(100, 700, 200, 300, 1024, 768)).toEqual({ x: 100, y: 464 })
  })
})

describe('ContextMenu', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    useAppStore.setState({
      menuOpen: true,
      menuX: 100,
      menuY: 60,
      playlists: [p1()],
      favorites: { id: 'favorites', name: '收藏', items: [], createdAt: 0 },
      instances: [0, 1, 2, 3].map((id) => ({
        id,
        playlistId: id === 0 ? 'p1' : null,
        currentIndex: 0,
        playMode: 'order' as const,
        isPlaying: true,
        volume: 1,
        rate: 1,
        scaleMode: 'contain' as const
      }))
    })
  })

  afterEach(() => {
    act(() => {
      container.remove()
    })
  })

  function renderMenu(): void {
    act(() => {
      createRoot(container).render(<ContextMenu />)
    })
  }

  function menuEl(): HTMLElement | null {
    return container.querySelector('.context-menu')
  }

  it('打开时渲染菜单与基础项（播放/暂停随 isPlaying）', () => {
    renderMenu()
    expect(menuEl()).not.toBeNull()
    const labels = Array.from(container.querySelectorAll('.menu-label')).map((e) => e.textContent)
    expect(labels).toContain('暂停')
    expect(labels).toContain('播放模式')
    expect(labels).toContain('倍速')
    expect(labels).toContain('画面缩放')
    expect(labels).toContain('收藏')
    expect(labels).toContain('下载 MP4')
  })

  it('置灰项不可点击（点击后菜单不关闭、无副作用）', () => {
    renderMenu()
    const item = Array.from(container.querySelectorAll('.menu-item')).find((e) => e.textContent?.includes('下载 MP4')) as HTMLElement
    expect(item.classList.contains('disabled')).toBe(true)
    act(() => {
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().menuOpen).toBe(true)
  })

  it('点击下一集：currentIndex 更新且菜单关闭', () => {
    renderMenu()
    const item = Array.from(container.querySelectorAll('.menu-item')).find((e) => e.textContent?.includes('下一集')) as HTMLElement
    act(() => {
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().instances[0].currentIndex).toBe(1)
    expect(useAppStore.getState().menuOpen).toBe(false)
  })

  it('点击外部（mousedown）关闭菜单', () => {
    renderMenu()
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(useAppStore.getState().menuOpen).toBe(false)
  })

  it('Esc 关闭菜单', () => {
    renderMenu()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(useAppStore.getState().menuOpen).toBe(false)
  })

  it('播放/暂停项操作 video（paused=true 时调用 play）', () => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'paused', { configurable: true, get: () => true })
    video.className = 'player-video'
    const wrapper = document.createElement('div')
    wrapper.className = 'player-view'
    wrapper.appendChild(video)
    document.body.appendChild(wrapper)
    renderMenu()
    const item = Array.from(container.querySelectorAll('.menu-item')).find((e) => e.textContent?.includes('暂停')) as HTMLElement
    act(() => {
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(video.play).toHaveBeenCalled()
    wrapper.remove()
  })

  it('右/下边缘不足时菜单位置翻转（clamp）', () => {
    const rectSpy = jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 200, height: 300, top: 0, left: 0, right: 200, bottom: 300, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 300 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 })
    useAppStore.setState({ menuX: 250, menuY: 350 })
    renderMenu()
    const el = menuEl()
    expect(el?.style.left).toBe('96px')
    expect(el?.style.top).toBe('96px')
    rectSpy.mockRestore()
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx jest src/renderer/src/components/__tests__/ContextMenu.test.tsx
```

预期：FAIL（Cannot find module '../ContextMenu'）。

- [ ] **Step 3: 实现 src/renderer/src/components/ContextMenu.tsx**

```tsx
import { useEffect, useRef, useState } from 'react'
import { useAppStore, MODES, MODE_LABEL, RATES } from '../store/appStore'
import { openFiles, openFolder, openUrlInput } from '../store/openMedia'

export function clampMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  vw: number,
  vh: number
): { x: number; y: number } {
  return {
    x: x + width > vw ? Math.max(0, vw - width - 4) : x,
    y: y + height > vh ? Math.max(0, vh - height - 4) : y
  }
}

interface MenuEntry {
  id: string
  label: string
  disabled?: boolean
  checked?: boolean
  divider?: boolean
  submenu?: MenuEntry[]
  action?: () => void
}

export default function ContextMenu(): React.JSX.Element | null {
  const menuOpen = useAppStore((s) => s.menuOpen)
  const menuX = useAppStore((s) => s.menuX)
  const menuY = useAppStore((s) => s.menuY)
  const [pos, setPos] = useState({ x: menuX, y: menuY })
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos(clampMenuPosition(menuX, menuY, rect.width, rect.height, window.innerWidth ?? 0, window.innerHeight ?? 0))
  }, [menuOpen, menuX, menuY])

  useEffect(() => {
    if (!menuOpen) return
    const onMouseDown = (e: MouseEvent): void => {
      const el = menuRef.current
      if (el && !el.contains(e.target as Node)) useAppStore.getState().closeMenu()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useAppStore.getState().closeMenu()
    }
    const onWheel = (e: WheelEvent): void => {
      const el = menuRef.current
      if (el && !el.contains(e.target as Node)) useAppStore.getState().closeMenu()
    }
    const onBlur = (): void => useAppStore.getState().closeMenu()
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('blur', onBlur)
    }
  }, [menuOpen])

  if (!menuOpen) return null

  const state = useAppStore.getState()
  const ins = state.instances[state.activeInstance]
  const list = ins.playlistId === 'favorites' ? state.favorites : state.playlists.find((p) => p.id === ins.playlistId)
  const item = list?.items[ins.currentIndex] ?? null
  const hasItem = !!item
  const isFav = item ? state.favorites.items.some((f) => f.id === item.id) : false

  const togglePlay = (): void => {
    const video = document.querySelector('.player-view video') as HTMLVideoElement | null
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }

  const entries: MenuEntry[] = [
    { id: 'toggle-play', label: ins.isPlaying ? '暂停' : '播放', disabled: !hasItem, action: togglePlay },
    { id: 'prev', label: '上一集', disabled: !hasItem, action: () => state.prevInInstance(state.activeInstance) },
    { id: 'next', label: '下一集', disabled: !hasItem, action: () => state.nextInInstance(state.activeInstance) },
    {
      id: 'mode',
      label: '播放模式',
      disabled: !hasItem,
      submenu: MODES.map((m) => ({
        id: `mode-${m}`,
        label: MODE_LABEL[m],
        checked: ins.playMode === m,
        action: () => state.setPlayMode(state.activeInstance, m)
      }))
    },
    {
      id: 'rate',
      label: '倍速',
      disabled: !hasItem,
      submenu: RATES.map((r) => ({
        id: `rate-${r}`,
        label: `${r}x`,
        checked: ins.rate === r,
        action: () => state.setRate(state.activeInstance, r)
      }))
    },
    {
      id: 'scale',
      label: '画面缩放',
      disabled: !hasItem,
      submenu: (
        [
          ['contain', '适应'],
          ['fill', '铺满']
        ] as const
      ).map(([v, label]) => ({
        id: `scale-${v}`,
        label,
        checked: ins.scaleMode === v,
        action: () => state.setScaleMode(state.activeInstance, v)
      }))
    },
    { id: 'fav', label: isFav ? '取消收藏' : '收藏', disabled: !hasItem, action: () => state.toggleFavorite() },
    { id: 'panel', label: '打开播放列表', action: () => state.togglePanel() },
    {
      id: 'sources',
      label: '来源管理',
      submenu: [
        { id: 'src-files', label: '打开文件', action: () => void openFiles(state.activeInstance) },
        { id: 'src-folder', label: '打开文件夹', action: () => void openFolder(state.activeInstance) },
        { id: 'src-url', label: '网络流', action: () => openUrlInput() }
      ]
    },
    { id: 'div1', label: '', divider: true },
    { id: 'download', label: '下载 MP4', disabled: true },
    { id: 'import', label: '导入 .mhlb', disabled: true },
    { id: 'export', label: '导出 .mhlb', disabled: true },
    { id: 'settings', label: '设置', disabled: true }
  ]

  const renderEntry = (entry: MenuEntry): React.JSX.Element => {
    if (entry.divider) return <div key={entry.id} className="menu-divider" />
    return (
      <div
        key={entry.id}
        className={`menu-item${entry.disabled ? ' disabled' : ''}${entry.checked ? ' checked' : ''}${
          entry.submenu ? ' has-submenu' : ''
        }`}
        onClick={() => {
          if (entry.disabled) return
          if (entry.submenu) return
          entry.action?.()
          useAppStore.getState().closeMenu()
        }}
      >
        <span className="menu-label">{entry.label}</span>
        {entry.checked && <span className="menu-check">✓</span>}
        {entry.submenu && <div className="submenu">{entry.submenu.map(renderEntry)}</div>}
      </div>
    )
  }

  return (
    <div ref={menuRef} className="context-menu" style={{ left: pos.x, top: pos.y }}>
      {entries.map(renderEntry)}
    </div>
  )
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx jest src/renderer/src/components/__tests__/ContextMenu.test.tsx
```

预期：PASS，10 个用例（3 纯函数 + 7 组件）。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/ContextMenu.tsx src/renderer/src/components/__tests__/ContextMenu.test.tsx
git commit -m "feat: 自定义右键菜单（定位翻转/子菜单/置灰/关闭链）"
```

---

## Task 6: 侧滑面板 SidePanel（TDD）

**Files:**
- Test: `src/renderer/src/components/__tests__/SidePanel.test.tsx`（新增）
- Create: `src/renderer/src/components/SidePanel.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import SidePanel from '../SidePanel'
import { useAppStore } from '../../store/appStore'
import type { Playlist } from '../../../../shared/types'

function makePlaylists(): Playlist[] {
  return [
    {
      id: 'p1',
      name: '列表一',
      items: [
        { id: 'm1', title: '甲', sourceType: 'file', value: 'C:\\a.mp4', createdAt: 3 },
        { id: 'm2', title: '乙', sourceType: 'file', value: 'C:\\b.mp4', createdAt: 1 },
        { id: 'm3', title: '丙', sourceType: 'file', value: 'C:\\c.mp4', createdAt: 2 }
      ],
      createdAt: 1
    }
  ]
}

describe('SidePanel', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    useAppStore.setState({
      panelOpen: true,
      panelTab: 'lists',
      sortMode: {},
      playlists: makePlaylists(),
      favorites: { id: 'favorites', name: '收藏', items: [], createdAt: 0 },
      instances: [0, 1, 2, 3].map((id) => ({
        id,
        playlistId: null,
        currentIndex: 0,
        playMode: 'order' as const,
        isPlaying: false,
        volume: 1,
        rate: 1,
        scaleMode: 'contain' as const
      }))
    })
  })

  afterEach(() => {
    act(() => {
      container.remove()
    })
  })

  function renderPanel(): void {
    act(() => {
      createRoot(container).render(<SidePanel />)
    })
  }

  function items(): HTMLElement[] {
    return Array.from(container.querySelectorAll('.panel-item'))
  }

  it('渲染播放列表 tab 与列表项（默认时间倒序：新在前）', () => {
    renderPanel()
    expect(items()).toHaveLength(3)
    const titles = items().map((e) => e.querySelector('.panel-item-title')?.textContent)
    expect(titles).toEqual(['甲', '丙', '乙'])
  })

  it('切换排序方式为名称后按名称排列', () => {
    renderPanel()
    const btn = Array.from(container.querySelectorAll('.panel-sort-actions button')).find(
      (b) => b.textContent === '名称'
    ) as HTMLElement
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const titles = items().map((e) => e.querySelector('.panel-item-title')?.textContent)
    expect(titles).toEqual(['丙', '甲', '乙'])
  })

  it('点击列表项播放（playItemFromList 更新活动实例）', () => {
    renderPanel()
    act(() => {
      items()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const ins = useAppStore.getState().instances[0]
    expect(ins.playlistId).toBe('p1')
    expect(ins.isPlaying).toBe(true)
    expect(ins.currentIndex).toBe(useAppStore.getState().playlists[0].items.findIndex((i) => i.id === 'm1'))
  })

  it('拖拽排序：dragstart/dragover/drop 后写回列表顺序', () => {
    renderPanel()
    const [first] = items()
    const last = items()[2]
    act(() => {
      first.dispatchEvent(new Event('dragstart', { bubbles: true }))
      last.dispatchEvent(new Event('dragover', { bubbles: true }))
      last.dispatchEvent(new Event('drop', { bubbles: true }))
    })
    expect(useAppStore.getState().playlists[0].items.map((i) => i.id)).toEqual(['m2', 'm3', 'm1'])
  })

  it('hover 删除按钮移除单项', () => {
    renderPanel()
    const del = items()[0].querySelector('.panel-item-del') as HTMLElement
    act(() => {
      del.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().playlists[0].items).toHaveLength(2)
  })

  it('清空列表', () => {
    renderPanel()
    const btn = container.querySelector('.panel-clear') as HTMLElement
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().playlists[0].items).toHaveLength(0)
  })

  it('tab 切换收藏并记忆（重渲染保持）', () => {
    renderPanel()
    const tab = Array.from(container.querySelectorAll('.panel-tabs button')).find(
      (b) => b.textContent === '收藏'
    ) as HTMLElement
    act(() => {
      tab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().panelTab).toBe('favorites')
    expect(container.querySelector('.panel-empty')?.textContent).toContain('收藏')
  })

  it('收藏 tab 显示收藏项并可取消收藏', () => {
    useAppStore.setState({
      panelTab: 'favorites',
      favorites: {
        id: 'favorites',
        name: '收藏',
        items: [{ id: 'f1', title: '喜欢的', sourceType: 'url', value: 'https://x.com/v.mp4' }],
        createdAt: 2
      }
    })
    renderPanel()
    expect(items()).toHaveLength(1)
    const del = items()[0].querySelector('.panel-item-del') as HTMLElement
    act(() => {
      del.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().favorites.items).toHaveLength(0)
  })

  it('「打开文件」按钮复用共享逻辑（dialog mock 返回路径）', async () => {
    const openFileMock = window.api.dialog.openFile as jest.Mock
    openFileMock.mockResolvedValue(['C:\\x\\movie.mp4'])
    renderPanel()
    const btn = Array.from(container.querySelectorAll('.panel-add-actions button')).find(
      (b) => b.textContent === '打开文件'
    ) as HTMLElement
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    const playlists = useAppStore.getState().playlists
    expect(playlists).toHaveLength(2)
    expect(playlists[1].items[0].title).toBe('movie')
  })

  it('遮罩点击关闭面板', () => {
    renderPanel()
    const mask = container.querySelector('.side-panel-mask') as HTMLElement
    act(() => {
      mask.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().panelOpen).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx jest src/renderer/src/components/__tests__/SidePanel.test.tsx
```

预期：FAIL（Cannot find module '../SidePanel'）。

- [ ] **Step 3: 实现 src/renderer/src/components/SidePanel.tsx**

```tsx
import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { sortItems, type SortMode } from '../store/playlistUtils'
import { openFiles, openFolder, openUrlInput } from '../store/openMedia'

const SORT_OPTIONS: Array<{ mode: SortMode; label: string }> = [
  { mode: 'name', label: '名称' },
  { mode: 'timeAsc', label: '时间正序' },
  { mode: 'timeDesc', label: '时间倒序' }
]

export default function SidePanel(): React.JSX.Element | null {
  const panelOpen = useAppStore((s) => s.panelOpen)
  const panelTab = useAppStore((s) => s.panelTab)
  const playlists = useAppStore((s) => s.playlists)
  const favorites = useAppStore((s) => s.favorites)
  const instances = useAppStore((s) => s.instances)
  const activeInstance = useAppStore((s) => s.activeInstance)
  const sortMode = useAppStore((s) => s.sortMode)
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)

  if (!panelOpen) return null

  const state = useAppStore.getState()
  const instance = instances[activeInstance]
  const effectiveListId = selectedListId ?? instance.playlistId ?? playlists[0]?.id ?? null
  const list = playlists.find((p) => p.id === effectiveListId) ?? null
  const mode = sortMode[effectiveListId ?? ''] ?? 'timeDesc'
  const displayItems = list
    ? sortItems(list.items, mode).map((item) => ({ item, index: list.items.indexOf(item) }))
    : []
  const isCurrent = (listId: string, index: number): boolean =>
    instance.playlistId === listId && instance.currentIndex === index

  return (
    <>
      <div className="side-panel-mask" onClick={() => state.closePanel()} />
      <aside className="side-panel">
        <div className="panel-header">
          <div className="panel-tabs">
            <button
              className={panelTab === 'lists' ? 'active' : ''}
              onClick={() => state.setPanelTab('lists')}
            >
              播放列表
            </button>
            <button
              className={panelTab === 'favorites' ? 'active' : ''}
              onClick={() => state.setPanelTab('favorites')}
            >
              收藏
            </button>
          </div>
          <button className="panel-close" title="关闭" onClick={() => state.closePanel()}>
            ×
          </button>
        </div>
        {panelTab === 'lists' ? (
          <div className="panel-body">
            <div className="panel-add-actions">
              <button onClick={() => void openFiles(activeInstance)}>打开文件</button>
              <button onClick={() => void openFolder(activeInstance)}>文件夹</button>
              <button onClick={() => openUrlInput()}>网络流</button>
            </div>
            {playlists.length === 0 ? (
              <div className="panel-empty">暂无播放列表，点击上方按钮添加</div>
            ) : (
              <>
                <select
                  className="panel-list-select"
                  value={effectiveListId ?? ''}
                  onChange={(e) => setSelectedListId(e.target.value || null)}
                >
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="panel-sort-actions">
                  {SORT_OPTIONS.map((o) => (
                    <button
                      key={o.mode}
                      className={mode === o.mode ? 'active' : ''}
                      onClick={() => state.setSortMode(effectiveListId ?? '', o.mode)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {displayItems.length === 0 ? (
                  <div className="panel-empty">列表为空</div>
                ) : (
                  <ul className="panel-items">
                    {displayItems.map(({ item, index }) => (
                      <li
                        key={item.id}
                        className={`panel-item${isCurrent(effectiveListId ?? '', index) ? ' current' : ''}${
                          dropTarget === index ? ' drag-over' : ''
                        }`}
                        draggable
                        onDragStart={() => setDragFrom(index)}
                        onDragOver={(e) => {
                          e.preventDefault()
                          setDropTarget(index)
                        }}
                        onDragLeave={() => setDropTarget((t) => (t === index ? null : t))}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (dragFrom !== null && dragFrom !== index) {
                            state.reorderItems(effectiveListId ?? '', dragFrom, index)
                          }
                          setDragFrom(null)
                          setDropTarget(null)
                        }}
                        onClick={() => state.playItemFromList(effectiveListId ?? '', index)}
                      >
                        <span className="panel-item-title">{item.title}</span>
                        <button
                          className="panel-item-del"
                          title="删除"
                          onClick={(e) => {
                            e.stopPropagation()
                            state.removeFromPlaylist(effectiveListId ?? '', item.id)
                          }}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="panel-footer">
                  <button className="panel-clear" onClick={() => state.clearPlaylist(effectiveListId ?? '')}>
                    清空列表
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="panel-body">
            {favorites.items.length === 0 ? (
              <div className="panel-empty">暂无收藏</div>
            ) : (
              <ul className="panel-items">
                {favorites.items.map((item, index) => (
                  <li
                    key={item.id}
                    className={`panel-item${isCurrent('favorites', index) ? ' current' : ''}`}
                    onClick={() => state.playItemFromList('favorites', index)}
                  >
                    <span className="panel-item-title">{item.title}</span>
                    <button
                      className="panel-item-del"
                      title="取消收藏"
                      onClick={(e) => {
                        e.stopPropagation()
                        state.removeFromFavorites(item.id)
                      }}
                    >
                      ♥
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>
    </>
  )
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx jest src/renderer/src/components/__tests__/SidePanel.test.tsx
```

预期：PASS，10 个用例。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/SidePanel.tsx src/renderer/src/components/__tests__/SidePanel.test.tsx
git commit -m "feat: 侧滑面板（列表/收藏双 tab、拖拽排序、排序切换、删除清空）"
```

---

## Task 7: 快捷键 + 爱心按钮 + App 集成 + 样式

**Files:**
- Modify: `src/renderer/src/hooks/useShortcuts.ts`
- Modify: `src/renderer/src/components/ControlsBar.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: 修改 src/renderer/src/hooks/useShortcuts.ts**（L 开面板、Esc 优先级链、全局 onContextMenu）

```ts
import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  )
}

export function useShortcuts(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return
      const state = useAppStore.getState()
      const instanceId = state.activeInstance
      const key = event.key
      const video = document.querySelector('.player-view video') as HTMLVideoElement | null

      switch (key) {
        case ' ':
          event.preventDefault()
          if (video) {
            if (video.paused) void video.play()
            else video.pause()
          }
          break
        case 'ArrowLeft':
          event.preventDefault()
          if (video) video.currentTime = Math.max(0, video.currentTime - 5)
          break
        case 'ArrowRight':
          event.preventDefault()
          if (video) video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5)
          break
        case 'ArrowUp':
          event.preventDefault()
          state.updateInstance(instanceId, { volume: Math.min(1, state.instances[instanceId].volume + 0.1) })
          break
        case 'ArrowDown':
          event.preventDefault()
          state.updateInstance(instanceId, { volume: Math.max(0, state.instances[instanceId].volume - 0.1) })
          break
        case 'm':
        case 'M':
          if (video) video.muted = !video.muted
          break
        case 'f':
        case 'F':
          void window.api.window.toggleFullscreen()
          break
        case 'p':
        case 'P':
          void window.api.window.getState().then((s) => {
            if (s.mode === 'mini') void window.api.window.exitMini()
            else void window.api.window.enterMini()
          })
          break
        case 'l':
        case 'L':
          state.togglePanel()
          break
        case 'Escape':
          // 优先级链：右键菜单 → 面板 → 退出全屏/置顶
          if (state.menuOpen) {
            state.closeMenu()
            return
          }
          if (state.panelOpen) {
            state.closePanel()
            return
          }
          void window.api.window.getState().then((s) => {
            if (s.mode === 'fullscreen') void window.api.window.exitFullscreen()
            else if (s.mode === 'mini') void window.api.window.exitMini()
          })
          break
      }
    }
    const onContextMenu = (e: MouseEvent): void => {
      e.preventDefault()
      useAppStore.getState().openMenu(e.clientX, e.clientY)
    }
    window.addEventListener('keydown', handler)
    window.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('contextmenu', onContextMenu)
    }
  }, [])
}
```

- [ ] **Step 2: 修改 src/renderer/src/components/ControlsBar.tsx**（爱心收藏按钮 + MODE_LABEL import）

```tsx
import { useEffect, useRef, useState } from 'react'
import { MODE_LABEL, useAppStore } from '../store/appStore'

interface ControlsBarProps {
  instanceId: number
  visible: boolean
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export default function ControlsBar({ instanceId, visible }: ControlsBarProps): React.JSX.Element {
  const instance = useAppStore((s) => s.instances[instanceId])
  const playlists = useAppStore((s) => s.playlists)
  const favorites = useAppStore((s) => s.favorites)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)

  const playlist = playlists.find((p) => p.id === instance.playlistId) ?? null
  const currentItem = playlist?.items[instance.currentIndex] ?? null
  const isFav = currentItem ? favorites.items.some((f) => f.id === currentItem.id) : false

  useEffect(() => {
    const root = document.querySelector('.player-view')
    videoRef.current = (root?.querySelector('video') as HTMLVideoElement | null) ?? null
  }, [instanceId])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onTime = (): void => setCurrentTime(video.currentTime)
    const onDur = (): void => setDuration(video.duration)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('durationchange', onDur)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('durationchange', onDur)
    }
  }, [videoRef.current])

  const seek = (value: number): void => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = value
    setCurrentTime(value)
  }

  const toggleVolume = (value: number): void => {
    useAppStore.getState().updateInstance(instanceId, { volume: value })
  }

  const toggleMuted = (): void => {
    const video = videoRef.current
    if (!video) return
    setMuted((m) => {
      video.muted = !m
      return !m
    })
  }

  const markPercent = currentItem?.lastPosition && duration > 0 ? (currentItem.lastPosition / duration) * 100 : null

  return (
    <div className={`controls-bar ${visible ? 'visible' : ''}`}>
      <div className="seek-row">
        <div className="seek-track">
          <input
            type="range"
            className="seek-range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(e) => seek(Number(e.target.value))}
            disabled={duration <= 0}
          />
          {markPercent !== null && (
            <span className="mark-dot" style={{ left: `${markPercent}%` }} title="记忆位置" />
          )}
        </div>
        <span className="time-label">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      <div className="btn-row">
        <button title="上一集" onClick={() => useAppStore.getState().prevInInstance(instanceId)}>
          ⏮
        </button>
        <button
          title={instance.isPlaying ? '暂停' : '播放'}
          onClick={() => {
            const video = videoRef.current
            if (!video) return
            if (video.paused) void video.play()
            else video.pause()
          }}
        >
          {instance.isPlaying ? '⏸' : '▶'}
        </button>
        <button title="下一集" onClick={() => useAppStore.getState().nextInInstance(instanceId)}>
          ⏭
        </button>
        <button
          title={isFav ? '取消收藏' : '收藏'}
          className={`fav-btn${isFav ? ' active' : ''}`}
          onClick={() => useAppStore.getState().toggleFavorite()}
        >
          {isFav ? '♥' : '♡'}
        </button>
        <button title="倍速" onClick={() => useAppStore.getState().cycleRate(instanceId)}>
          {instance.rate}x
        </button>
        <button title="播放模式" onClick={() => useAppStore.getState().cyclePlayMode(instanceId)}>
          {MODE_LABEL[instance.playMode] ?? instance.playMode}
        </button>
        <div className="volume-wrap">
          <button title={muted ? '取消静音' : '静音'} onClick={toggleMuted}>
            {muted ? '🔇' : '🔊'}
          </button>
          <input
            type="range"
            className="volume-range"
            min={0}
            max={1}
            step={0.01}
            value={instance.volume}
            onChange={(e) => toggleVolume(Number(e.target.value))}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 修改 src/renderer/src/App.tsx**（接入 SidePanel/ContextMenu）

```tsx
import { useEffect } from 'react'
import PlayerView from './components/PlayerView'
import SidePanel from './components/SidePanel'
import ContextMenu from './components/ContextMenu'
import { useAppStore } from './store/appStore'
import { flushPositions, persistNow, persistPositionOnly } from './store/appStore'
import { useShortcuts } from './hooks/useShortcuts'

export default function App(): React.JSX.Element {
  const activeInstance = useAppStore((s) => s.activeInstance)
  const hydrate = useAppStore((s) => s.hydrate)
  useShortcuts()

  useEffect(() => {
    window.api.store.getAll().then((snapshot) => hydrate(snapshot))
  }, [hydrate])

  useEffect(() => {
    // 周期兜底：进程被强杀时也能保留最近播放位置（不更新 UI 记忆点）
    const timer = setInterval(() => {
      void persistPositionOnly().catch(() => {})
    }, 15000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    return window.api.app.onClosing(() => {
      flushPositions()
      void persistNow().finally(() => window.api.app.readyToClose())
    })
  }, [])

  return (
    <div className="app">
      <div className="app-titlebar" />
      <PlayerView instanceId={activeInstance} />
      <SidePanel />
      <ContextMenu />
    </div>
  )
}
```

- [ ] **Step 4: styles.css 追加**（面板/菜单/爱心样式，追加到文件末尾）

```css
.side-panel-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 30;
}

.side-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  z-index: 40;
  background: #161618;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  animation: panel-in 0.25s ease-out;
}

@keyframes panel-in {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  padding: 12px;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.panel-tabs {
  display: flex;
  flex: 1;
  gap: 4px;
}

.panel-tabs button {
  flex: 1;
  padding: 6px 0;
  border: none;
  border-radius: 6px;
  background: none;
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  cursor: pointer;
}

.panel-tabs button.active {
  background: rgba(254, 44, 85, 0.16);
  color: #fe2c55;
  font-weight: 600;
}

.panel-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
}

.panel-close:hover {
  color: #fe2c55;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-add-actions {
  display: flex;
  gap: 6px;
}

.panel-add-actions button {
  flex: 1;
  background: rgba(255, 255, 255, 0.12);
  border: none;
  color: #f5f5f5;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.panel-add-actions button:hover {
  background: rgba(255, 255, 255, 0.24);
}

.panel-list-select {
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: #1c1c1e;
  color: #f5f5f5;
  font-size: 12px;
  outline: none;
}

.panel-list-select:focus {
  border-color: #fe2c55;
}

.panel-sort-actions {
  display: flex;
  gap: 6px;
}

.panel-sort-actions button {
  flex: 1;
  padding: 4px 0;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  cursor: pointer;
}

.panel-sort-actions button.active {
  border-color: #fe2c55;
  color: #fe2c55;
}

.panel-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.panel-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
}

.panel-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.panel-item.current {
  background: rgba(254, 44, 85, 0.14);
  color: #fe2c55;
}

.panel-item.drag-over {
  outline: 1px dashed #fe2c55;
}

.panel-item-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-item-del {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  font-size: 13px;
  padding: 0 4px;
}

.panel-item-del:hover {
  color: #fe2c55;
}

.panel-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.35);
  font-size: 12px;
  padding: 32px 0;
}

.panel-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 10px;
}

.panel-clear {
  width: 100%;
  padding: 7px 0;
  border-radius: 6px;
  border: 1px solid rgba(254, 44, 85, 0.4);
  background: none;
  color: #fe2c55;
  font-size: 12px;
  cursor: pointer;
}

.panel-clear:hover {
  background: rgba(254, 44, 85, 0.12);
}

.fav-btn {
  color: rgba(255, 255, 255, 0.85);
}

.fav-btn.active {
  color: #fe2c55;
}

.context-menu {
  position: fixed;
  z-index: 60;
  min-width: 180px;
  padding: 6px;
  border-radius: 10px;
  background: rgba(28, 28, 30, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  font-size: 13px;
}

.menu-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.92);
  white-space: nowrap;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.menu-item.disabled {
  color: rgba(255, 255, 255, 0.3);
  cursor: default;
}

.menu-item.disabled:hover {
  background: none;
}

.menu-item.has-submenu::after {
  content: '›';
  margin-left: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.menu-check {
  color: #fe2c55;
}

.submenu {
  display: none;
  position: absolute;
  left: calc(100% - 2px);
  top: -6px;
  min-width: 120px;
  padding: 6px;
  border-radius: 10px;
  background: rgba(28, 28, 30, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}

.menu-item:hover > .submenu {
  display: block;
}

.menu-divider {
  height: 1px;
  margin: 6px 4px;
  background: rgba(255, 255, 255, 0.12);
}
```

- [ ] **Step 5: 验证 + 提交**

```bash
npm run typecheck
npx jest
```

预期：typecheck 无报错；全部测试 PASS（约 81 用例）。

```bash
git add -A
git commit -m "feat: 快捷键 L/Esc 优先级链、全局右键菜单、爱心按钮与面板样式"
```

---

## Task 8: 收尾验证与验收

**Files:** 无新增

- [ ] **Step 1: 全量验证**

```bash
npm run typecheck
npm test
npm run build
```

预期：typecheck 无报错；测试全绿（既有 39 + 新增 ~42 用例）；build 成功产出 out/。

- [ ] **Step 2: 手动验收（dev）**

```bash
npm run dev
```

验收清单（对应 spec 第 10 节）：
- [ ] 右键播放区 → 自定义菜单弹出（深色圆角），倍速/模式/缩放当前项打勾，置灰项不可点击
- [ ] 菜单在窗口右/下边缘自动翻转定位；点击外部/Esc 关闭
- [ ] 右上「列表」按钮与 L 键开合面板，tab 记忆保留
- [ ] 打开文件/文件夹/网络流 → 新列表出现在面板，下拉可切换多列表
- [ ] 列表点击项播放；当前项高亮；拖拽换序生效；删除/清空生效
- [ ] 排序切换：名称 / 时间正序 / 倒序（新增文件时间戳正确）
- [ ] 控制栏爱心：未收藏白心 → 点击变红实心；收藏 tab 出现该项；再点取消
- [ ] 收藏项可点播；收藏变化关闭重开仍在（持久化）
- [ ] 画面缩放 contain/fill 切换即时生效
- [ ] 面板/菜单打开时播放不中断；全屏下菜单/面板正常
- [ ] 回归：播放/续播/快捷键/控制列隐藏均正常

- [ ] **Step 3: 最终提交**

```bash
git status --short
```

若无未提交内容则跳过；否则 `git add -A && git commit -m "chore: P3 收尾"`。

---

## 实施变更记录（与实际实现差异）

以下为实施过程中对计划的修正，均已通过测试：

1. **名称排序预期（Task 2）**：`localeCompare(zh-Hans-CN)` 按拼音排序，丙(bǐng) < 甲(jiǎ) < 乙(yǐ)，测试预期改为 `['c','a','b']`。
2. **toggleFavorite 语义（Task 3）**：计划中"重复收藏去重"（两次 toggle 期望 1）与"再点取消"（两次 toggle 期望 0）自相矛盾；按 spec 3.2 的"收藏/取消收藏"切换语义实现（存在则移除、不存在则添加，天然无重复项），原"去重"用例改为"引用复制（删原列表项不影响收藏）" + "切换往返不产生重复项"。
3. **测试环境（Task 3）**：`tests/setup.ts` 除 mock `window.api` 外，补充 `IS_REACT_ACT_ENVIRONMENT = true` 消除 React 19 act 环境噪音。
4. **组件测试模式（Task 5/6）**：`afterEach` 中 `root.unmount()` 与 `container.remove()` 配对（否则上个用例的 root 仍订阅 store，beforeEach 的 setState 触发未包裹 act 的重渲染警告）；`act` 从 `react` 导入（React 19 推荐，替代 react-dom/test-utils 废弃的 act）。
5. **拖拽源用 ref（Task 6）**：`dragFrom` 由 state 改为 `useRef`——jsdom 测试中 dragstart/drop 在同一 act 内同步触发，state 更新被批处理导致 drop 时读不到源索引；ref 同步读写不依赖渲染时序，真实浏览器场景更稳。
6. **拖拽排序测试预期（Task 6）**：默认时间倒序下显示顺序 [m1(原0), m3(原2), m2(原1)]，`items()[2]` 是 m2 且原始索引为 1，故拖首项到第三项位置产生 `reorder(0,1)` → `['m2','m1','m3']`（计划原预期 `['m2','m3','m1']` 错误地假设了显示索引=原始索引）。

---

## 自我审查记录（Self-Review）

**Spec 覆盖：** 侧滑面板（spec §4：双 tab、拖拽排序、三种排序、删除/清空、添加入口、tab 记忆、遮罩/Esc/X 关闭）→ Task 6/7；收藏（§3.3：引用复制、id 去重、爱心按钮 + 右键菜单、持久化）→ Task 3/5/7；右键菜单（§5：菜单树、置灰、打勾、翻转定位、关闭时机、Esc 优先级链）→ Task 5/7；画面缩放（§6：object-fit 绑定 scaleMode、右键子菜单入口）→ Task 4/5；数据层 createdAt（§3.1）→ Task 1；测试策略（§7：纯函数/actions/组件/回归）→ Task 2/3/5/6/8。

**占位符扫描：** 所有步骤均给出完整代码与命令，无 TBD/TODO。

**类型一致性：** `SortMode`（Task 2 定义）在 appStore/sidePanel/测试中统一；`AppStore` 接口新字段与 create 初始值一一对应（panelOpen/panelTab/sortMode/menuOpen/menuX/menuY/urlInputOpen）；actions 名（toggleFavorite/removeFromFavorites/reorderItems/setSortMode/playItemFromList/setScaleMode/openPanel/closePanel/togglePanel/setPanelTab/openMenu/closeMenu/openUrlInput/closeUrlInput/setPlayMode/setRate/removeFromPlaylist/clearPlaylist）在组件与测试中引用一致；`RATES/MODES/MODE_LABEL` 从 appStore 导出供 ContextMenu/ControlsBar 使用；`reorderItems` store action 内部调用 `reorderList`（playlistUtils 纯函数）避免同名遮蔽。

**已知取舍：** 右键菜单「网络流」通过 store `urlInputOpen` 驱动 PlayerView 内的输入浮层（菜单与浮层分属不同组件，用 store 状态桥接）；拖拽排序未使用 dataTransfer（jsdom 不支持 DragEvent），索引存组件 state，拖放事件用原生 Event 模拟可测；面板列表选择器为组件本地 state（关闭重开时 fiber 保留状态，符合记忆需求）。
