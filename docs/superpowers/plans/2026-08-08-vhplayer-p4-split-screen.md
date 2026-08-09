# VHplayer P4：4 分屏 + 仅置顶按钮实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 2x2 四格分屏（1x1↔2x2 布局切换、进入分屏按视频尺寸初始化窗口、每格独立播放列表/音量/倍速/进度、活动格白色描边高亮、全局控制作用于活动格），并新增「仅置顶」按钮（图钉，只切 alwaysOnTop，不触碰窗口 bounds/形态）。

**Architecture:** 复用既有 4 槽位 `instances` 模型与 `viewMode` 字段。新增纯函数 `gridLayout.ts::computeGridBounds`（TDD）计算分屏窗口 bounds；主进程 WindowManager 增加 `setPinned`（仅 `setAlwaysOnTop`，不动 mode/bounds）并新增 `window:set-pinned` IPC；store 增加非持久化 UI 状态 `videoRegistry`/`videoSizes`/`windowMode`/`pinned` 与 `toggleGridMode`/`toggleMini`/`togglePinned` 等 actions；App 按 `viewMode + windowMode` 渲染 1 或 4 个 PlayerView；全局 video 获取从 `document.querySelector` 改为 `store.videoRegistry`（消除 P3 已知取舍）。

**Tech Stack:** 同 P1-P3（Electron + React 19 + Zustand 5 + Jest 30/jsdom），零新增依赖。

**前置依赖:** P3 已完成并验收。权威 spec：`docs/superpowers/specs/2026-08-08-vhplayer-design.md`（需求 11、第 6 节「4 分屏」）；P3 计划末尾标注 P4 已知取舍（`flushPositions` 等 querySelector 改 ref 传递）。

## 已确认决策（用户 2026-08-08）

1. **mini 与分屏**：`windowMode === 'mini'` 时按 single 布局渲染活动格单格；退出 mini 自动恢复 2x2 网格（store `windowMode` 联动，不打断分屏状态）
2. **分屏窗口尺寸基准**：保持当前窗口宽度，高 = 宽 / 视频平均宽高比（无有效尺寸则不调整窗口）
3. **viewMode 不持久化**：启动默认单屏；实例列表/音量/倍速已持久化，无需记忆分屏
4. **仅置顶按钮**：新增图钉按钮，只切换 `setAlwaysOnTop`，不改变窗口 bounds/形态；与「置顶小窗」（mini）按钮并存，二者图标不同（置顶=pin 图钉、小窗=minimize-2）
5. **执行分支**：直接在 main 提交（延续 P1-P3），每 Task 一个提交

## 轻量资源约束（延续 P1-P3 硬性要求）

1. 零新增 npm 依赖
2. `videoRegistry`/`videoSizes`/`windowMode`/`pinned`/`viewMode` 为纯 UI 状态，**不纳入 StoreSnapshot 持久化**；`flushPositions`/`persistPositionOnly` 落盘逻辑不变
3. **切换视频绝不触碰窗口 bounds/形态**；仅进入分屏（用户触发按钮/G 键）时调用一次 `resizeTo`；置顶按钮仅动 `alwaysOnTop`；退出分屏、切换实例均不调整窗口

## 文件结构（本计划最终交付）

```
src/shared/types.ts               Modify：WindowState.pinned、IPC.windowSetPinned、IpcApi.window.setPinned
src/main/windowManager.ts         Modify：pinned 字段 + setPinned（仅 alwaysOnTop）；exitMini 恢复 pinned；getState 返回 pinned
src/main/__tests__/windowManager.test.ts Modify：getState 断言补 pinned；新增 setPinned/exitMini 恢复用例
src/main/ipc.ts                   Modify：注册 window:set-pinned handler
src/preload/index.ts              Modify：setPinned 桥接
tests/setup.ts                    Modify：mock window.api.window.setPinned
src/renderer/src/
├── gridLayout.ts                 Create：分屏窗口尺寸纯函数 computeGridBounds
├── __tests__/gridLayout.test.ts  Create：computeGridBounds 单测
├── store/appStore.ts             Modify：videoRegistry/videoSizes/windowMode/pinned + 8 个 actions；flushPositions/persistPositionOnly 改读 registry
├── store/__tests__/appStoreGrid.test.ts Create：分屏/置顶 store actions 单测
├── components/PlayerView.tsx     Modify：注册/注销 video、上报/清除视频尺寸、分屏按钮、置顶按钮、点击激活、toggleMini 走 store、移除 UrlInputOverlay
├── components/__tests__/App.test.tsx Create：网格渲染/激活切换/mini 联动
├── components/ContextMenu.tsx    Modify：togglePlay 改读 videoRegistry[activeInstance]
├── components/__tests__/ContextMenu.test.tsx Modify：播放/暂停用例改注册 registry
├── components/ControlsBar.tsx    Modify：video 改从 videoRegistry[instanceId] 订阅
├── components/icons.tsx          Modify：新增 grid、minimize2 图标
├── hooks/useShortcuts.ts         Modify：G 键切换分屏、P 键走 toggleMini、video 改读 registry
├── hooks/__tests__/useShortcuts.test.tsx Create：G/空格/P 键用例
├── App.tsx                       Modify：grid 渲染 4 格 / single 渲染活动格、UrlInputOverlay 提升、启动同步窗口状态
└── styles.css                    Modify：.player-grid 2x2、.player-view.active 白色描边、.pinned-btn.active
```

## Task 1: 分屏尺寸纯函数 gridLayout（TDD）

**Files:**
- Create: `src/renderer/src/gridLayout.ts`
- Test: `src/renderer/src/__tests__/gridLayout.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { computeGridBounds } from '../gridLayout'

describe('computeGridBounds', () => {
  const cur = { x: 100, y: 50, width: 960, height: 540 }

  it('无有效尺寸 → null（保持当前窗口不调整）', () => {
    expect(computeGridBounds([null, null, null, null], cur)).toBeNull()
    expect(computeGridBounds([{ w: 0, h: 0 }, null, { w: -1, h: 2 }, null], cur)).toBeNull()
  })

  it('单个 16:9 → 宽保持当前，高 = 宽/比例', () => {
    expect(computeGridBounds([{ w: 1920, h: 1080 }, null, null, null], cur)).toEqual({
      x: 100,
      y: 50,
      width: 960,
      height: 540
    })
  })

  it('多个尺寸取宽高比平均值', () => {
    // (16/9 + 4/3) / 2 = 1.5555… → 高 = round(960 / 1.5555…) = 617
    expect(computeGridBounds([{ w: 1920, h: 1080 }, { w: 640, h: 480 }, null, null], cur)).toEqual({
      x: 100,
      y: 50,
      width: 960,
      height: 617
    })
  })

  it('位置与宽度保持当前窗口', () => {
    const r = computeGridBounds([{ w: 1920, h: 1080 }, null, null, null], { x: 10, y: 20, width: 800, height: 600 })
    expect(r).toEqual({ x: 10, y: 20, width: 800, height: 450 })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx jest src/renderer/src/__tests__/gridLayout.test.ts`
Expected: FAIL（`computeGridBounds` not exported）

- [ ] **Step 3: 实现纯函数**

```ts
export interface VideoSize {
  w: number
  h: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 计算进入分屏后的窗口 bounds：
 * - 取 4 槽位中有效视频尺寸的宽高比平均值（规格：取平均，无有效值则不动窗口）
 * - 新宽 = 当前窗口宽（保持用户宽度心智），新高 = 宽 / 平均宽高比
 * - 2x2 网格中每格宽高比 = 窗口宽高比，contain 下无额外黑边
 * - 返回 null 表示保持当前窗口（由 resizeTo 主进程钳制 min 480x320 / 工作区 1.5 倍兜底）
 */
export function computeGridBounds(sizes: Array<VideoSize | null>, current: Rect): Rect | null {
  const valid = sizes.filter((s): s is VideoSize => !!s && s.w > 0 && s.h > 0)
  if (valid.length === 0) return null
  const avgRatio = valid.reduce((sum, s) => sum + s.w / s.h, 0) / valid.length
  const height = Math.max(1, Math.round(current.width / avgRatio))
  return { x: current.x, y: current.y, width: current.width, height }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx jest src/renderer/src/__tests__/gridLayout.test.ts`
Expected: PASS（4 用例）

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/gridLayout.ts src/renderer/src/__tests__/gridLayout.test.ts
git commit -m "feat: 分屏窗口尺寸纯函数 computeGridBounds（保持宽高比、无有效尺寸不动窗口）"
```

## Task 2: 主进程「仅置顶」支持（windowManager + 类型 + IPC + preload）

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/windowManager.ts`
- Modify: `src/main/__tests__/windowManager.test.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `tests/setup.ts`

- [ ] **Step 1: 写失败测试**

`src/main/__tests__/windowManager.test.ts` 中新增 describe 块（沿用现有 FakeWindow 与 helper，先读该文件确认现有结构）：

```ts
describe('setPinned（仅置顶，不触碰形态与 bounds）', () => {
  function makeFake(): { fake: FakeWindow; mgr: WindowManager } {
    const fake = new FakeWindow()
    const mgr = new WindowManager(fake)
    return { fake, mgr }
  }

  it('setPinned(true) 仅调 setAlwaysOnTop，不改变 mode 与 bounds', () => {
    const { fake, mgr } = makeFake()
    fake.setBounds({ x: 10, y: 20, width: 800, height: 450 })
    mgr.setPinned(true)
    expect(fake.alwaysOnTop).toBe(true)
    expect(mgr.getState().mode).toBe('window')
    expect(mgr.getState().bounds).toEqual({ x: 10, y: 20, width: 800, height: 450 })
    expect(mgr.getState().pinned).toBe(true)
  })

  it('setPinned(false) 解除置顶', () => {
    const { fake, mgr } = makeFake()
    mgr.setPinned(true)
    mgr.setPinned(false)
    expect(fake.alwaysOnTop).toBe(false)
    expect(mgr.getState().pinned).toBe(false)
  })

  it('置顶状态进入小窗退出后恢复置顶（exitMini 不清除用户置顶）', () => {
    const { fake, mgr } = makeFake()
    mgr.setPinned(true)
    mgr.enterMini()
    expect(fake.alwaysOnTop).toBe(true)
    mgr.exitMini()
    expect(fake.alwaysOnTop).toBe(true)
    expect(mgr.getState().pinned).toBe(true)
  })

  it('未置顶时退出小窗回到非置顶（不残留 alwaysOnTop）', () => {
    const { fake, mgr } = makeFake()
    mgr.enterMini()
    mgr.exitMini()
    expect(fake.alwaysOnTop).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx jest src/main/__tests__/windowManager.test.ts`
Expected: FAIL（`setPinned` 不存在、`getState().pinned` undefined）

- [ ] **Step 3: 实现主进程**

`src/main/windowManager.ts`：

- `WindowState` 接口增加 `pinned: boolean`（第 17-20 行区域）
- 增加字段与方法：

```ts
  private pinned = false

  /** 仅置顶：只切 alwaysOnTop，绝不触碰 bounds 与形态状态机 */
  setPinned(flag: boolean): void {
    this.pinned = flag
    this.safe(() => {
      this.win.setAlwaysOnTop(flag)
    })
  }
```

- `getState()` 返回增加 `pinned: this.pinned`
- `exitMini()` 内 `this.win.setAlwaysOnTop(false)` 改为 `this.win.setAlwaysOnTop(this.pinned)`

`src/shared/types.ts`：

- `WindowState`（53-56 行）增加 `pinned: boolean`
- `IPC` 常量增加 `windowSetPinned: 'window:set-pinned'`
- `IpcApi.window` 增加 `setPinned(flag: boolean): Promise<void>`

`src/main/ipc.ts`（`windowExitMini` handler 后）：

```ts
  ipcMain.handle(IPC.windowSetPinned, (_event, flag: boolean) => windowManager.setPinned(flag))
```

`src/preload/index.ts`（`resizeTo` 后）：

```ts
    setPinned: (flag: boolean) => ipcRenderer.invoke(IPC.windowSetPinned, flag),
```

`tests/setup.ts`（`resizeTo` mock 后）：

```ts
      setPinned: jest.fn(() => Promise.resolve()),
```

- [ ] **Step 4: 运行确认通过**

Run: `npx jest src/main; npm run typecheck`
Expected: 全部 PASS、typecheck 无报错（若既有 getState 断言因新增 pinned 字段失败，同步更新这些断言为 `pinned: false`）

- [ ] **Step 5: 提交**

```bash
git add src/shared/types.ts src/main/windowManager.ts src/main/__tests__/windowManager.test.ts src/main/ipc.ts src/preload/index.ts tests/setup.ts
git commit -m "feat: 主进程仅置顶能力（setPinned 只切 alwaysOnTop，退出小窗恢复置顶状态）"
```

## Task 3: store 扩展（分屏 + 置顶状态与 actions，TDD）

**Files:**
- Modify: `src/renderer/src/store/appStore.ts`（接口、create 初始值、actions、`flushPositions`/`persistPositionOnly`）
- Test: `src/renderer/src/store/__tests__/appStoreGrid.test.ts`（Create）

- [ ] **Step 1: 写失败测试**

```ts
import { useAppStore, flushPositions } from '../appStore'
import type { Playlist } from '../../../../shared/types'

function resetState(): void {
  useAppStore.setState({
    viewMode: 'single',
    activeInstance: 0,
    windowMode: 'window',
    pinned: false,
    videoRegistry: { 0: null, 1: null, 2: null, 3: null },
    videoSizes: { 0: null, 1: null, 2: null, 3: null },
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
    playlists: [],
    favorites: { id: 'favorites', name: '收藏', items: [], createdAt: 0 },
    settings: { downloadDir: '', autoResume: true }
  })
  ;(window.api.window.getState as jest.Mock).mockResolvedValue({
    mode: 'window',
    bounds: { x: 0, y: 0, width: 960, height: 540 },
    pinned: false
  })
  ;(window.api.window.resizeTo as jest.Mock).mockClear()
  ;(window.api.window.enterMini as jest.Mock).mockClear()
  ;(window.api.window.exitMini as jest.Mock).mockClear()
  ;(window.api.window.setPinned as jest.Mock).mockClear()
}

function makePlaylist(): Playlist {
  return { id: 'p1', name: '列表', items: [{ id: 'm1', title: '一', sourceType: 'file', value: 'C:\\a.mp4' }], createdAt: 1 }
}

describe('分屏 store actions', () => {
  beforeEach(resetState)

  it('registerVideo 注册/清空实例 video 引用', () => {
    const v = document.createElement('video')
    useAppStore.getState().registerVideo(2, v)
    expect(useAppStore.getState().videoRegistry[2]).toBe(v)
    useAppStore.getState().registerVideo(2, null)
    expect(useAppStore.getState().videoRegistry[2]).toBeNull()
  })

  it('setVideoSize 记录尺寸，传 0 清除', () => {
    useAppStore.getState().setVideoSize(0, 1920, 1080)
    expect(useAppStore.getState().videoSizes[0]).toEqual({ w: 1920, h: 1080 })
    useAppStore.getState().setVideoSize(0, 0, 0)
    expect(useAppStore.getState().videoSizes[0]).toBeNull()
  })

  it('setWindowMode 更新窗口形态', () => {
    useAppStore.getState().setWindowMode('mini')
    expect(useAppStore.getState().windowMode).toBe('mini')
  })

  it('toggleGridMode 进入分屏：按视频比例 resizeTo', async () => {
    useAppStore.getState().setVideoSize(0, 1920, 1080)
    useAppStore.getState().toggleGridMode()
    expect(useAppStore.getState().viewMode).toBe('grid')
    await new Promise((r) => setTimeout(r, 0))
    expect(window.api.window.resizeTo).toHaveBeenCalledWith(0, 0, 960, 540)
  })

  it('toggleGridMode 无视频尺寸 → 不 resize', async () => {
    useAppStore.getState().toggleGridMode()
    expect(useAppStore.getState().viewMode).toBe('grid')
    await new Promise((r) => setTimeout(r, 0))
    expect(window.api.window.resizeTo).not.toHaveBeenCalled()
  })

  it('toggleGridMode 再次调用退出分屏（不 resize）', async () => {
    useAppStore.getState().setVideoSize(0, 1920, 1080)
    useAppStore.getState().toggleGridMode()
    await new Promise((r) => setTimeout(r, 0))
    useAppStore.getState().toggleGridMode()
    expect(useAppStore.getState().viewMode).toBe('single')
    expect(window.api.window.resizeTo).toHaveBeenCalledTimes(1)
  })

  it('toggleMini：window→mini→window 联动 windowMode', async () => {
    await useAppStore.getState().toggleMini()
    expect(window.api.window.enterMini).toHaveBeenCalled()
    expect(useAppStore.getState().windowMode).toBe('mini')
    await useAppStore.getState().toggleMini()
    expect(window.api.window.exitMini).toHaveBeenCalled()
    expect(useAppStore.getState().windowMode).toBe('window')
  })

  it('togglePinned：切换 setPinned 并同步状态', async () => {
    await useAppStore.getState().togglePinned()
    expect(window.api.window.setPinned).toHaveBeenCalledWith(true)
    expect(useAppStore.getState().pinned).toBe(true)
    await useAppStore.getState().togglePinned()
    expect(window.api.window.setPinned).toHaveBeenCalledWith(false)
    expect(useAppStore.getState().pinned).toBe(false)
  })

  it('flushPositions 从 videoRegistry 读取各实例视频当前时间', () => {
    useAppStore.setState({ playlists: [makePlaylist()] })
    useAppStore.getState().updateInstance(0, { playlistId: 'p1', currentIndex: 0 })
    const v = document.createElement('video')
    Object.defineProperty(v, 'currentTime', { configurable: true, get: () => 42, set: () => {} })
    useAppStore.getState().registerVideo(0, v)
    flushPositions()
    expect(useAppStore.getState().playlists[0].items[0].lastPosition).toBe(42)
  })

  it('syncWindowStateFromMain 从主进程同步窗口形态与置顶', async () => {
    ;(window.api.window.getState as jest.Mock).mockResolvedValue({
      mode: 'mini',
      bounds: { x: 0, y: 0, width: 420, height: 280 },
      pinned: true
    })
    await useAppStore.getState().syncWindowStateFromMain()
    expect(useAppStore.getState().windowMode).toBe('mini')
    expect(useAppStore.getState().pinned).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx jest src/renderer/src/store/__tests__/appStoreGrid.test.ts`
Expected: FAIL（`registerVideo`/`videoRegistry`/`togglePinned` 等不存在）

- [ ] **Step 3: 实现 store 扩展**

`src/renderer/src/store/appStore.ts`：

import 增加：

```ts
import type { AppState, MediaItem, Playlist, PlayerInstance, Settings, StoreSnapshot, WindowMode } from '../../../shared/types'
import { computeGridBounds } from '../gridLayout'
```

接口 `AppStore` 增加（紧邻 `setActiveInstance` 声明处）：

```ts
  registerVideo(instanceId: number, video: HTMLVideoElement | null): void
  setVideoSize(instanceId: number, w: number, h: number): void
  setWindowMode(mode: WindowMode): void
  syncWindowStateFromMain(): Promise<void>
  toggleGridMode(): void
  toggleMini(): Promise<void>
  togglePinned(): Promise<void>
```

create 初始值增加（`viewMode: 'single'` 之后）：

```ts
  videoRegistry: { 0: null, 1: null, 2: null, 3: null } as Record<number, HTMLVideoElement | null>,
  videoSizes: { 0: null, 1: null, 2: null, 3: null } as Record<number, { w: number; h: number } | null>,
  windowMode: 'window',
  pinned: false,
```

actions 实现（放在 `setActiveInstance` 之后）：

```ts
  registerVideo: (instanceId, video) =>
    set({ videoRegistry: { ...get().videoRegistry, [instanceId]: video } }),

  setVideoSize: (instanceId, w, h) =>
    set({
      videoSizes: { ...get().videoSizes, [instanceId]: w > 0 && h > 0 ? { w, h } : null }
    }),

  setWindowMode: (mode) => set({ windowMode: mode }),

  syncWindowStateFromMain: async () => {
    const s = await window.api.window.getState()
    set({ windowMode: s.mode, pinned: s.pinned })
  },

  toggleGridMode: () => {
    const state = get()
    if (state.viewMode === 'grid') {
      set({ viewMode: 'single' })
      return
    }
    const sizes = [0, 1, 2, 3].map((id) => state.videoSizes[id] ?? null)
    set({ viewMode: 'grid' })
    void (async () => {
      const win = await window.api.window.getState()
      const bounds = computeGridBounds(sizes, win.bounds)
      if (bounds) await window.api.window.resizeTo(bounds.x, bounds.y, bounds.width, bounds.height)
    })()
  },

  toggleMini: async () => {
    const state = get()
    if (state.windowMode === 'mini') {
      await window.api.window.exitMini()
      set({ windowMode: 'window' })
    } else {
      await window.api.window.enterMini()
      set({ windowMode: 'mini' })
    }
  },

  togglePinned: async () => {
    const next = !get().pinned
    await window.api.window.setPinned(next)
    set({ pinned: next })
  },
```

- [ ] **Step 4: 改造 flushPositions 与 persistPositionOnly（读 registry）**

`flushPositions`（280-293 行）改为：

```ts
/** 关闭前把各实例当前播放位置写入 lastPosition（video 引用取自 store registry） */
export function flushPositions(): void {
  const state = useAppStore.getState()
  for (const ins of state.instances) {
    if (ins.playlistId === null) continue
    const playlist = state.playlists.find((p) => p.id === ins.playlistId)
    const item = playlist?.items[ins.currentIndex]
    const video = state.videoRegistry[ins.id]
    if (item && video && Number.isFinite(video.currentTime) && video.currentTime > 0) {
      useAppStore.getState().updateItemLastPosition(ins.playlistId, item.id, video.currentTime)
    }
  }
}
```

`persistPositionOnly`（299-318 行）中删除 `const videos = Array.from(document.querySelectorAll...)` 行，改为在循环内：

```ts
    const video = state.videoRegistry[ins.id]
```

- [ ] **Step 5: 运行全部测试确认通过且无回归**

Run: `npx jest src/renderer/src/store; npm run typecheck`
Expected: PASS（appStoreActions + appStoreGrid + playlistUtils 全部绿）、typecheck 无报错

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/store/appStore.ts src/renderer/src/store/__tests__/appStoreGrid.test.ts
git commit -m "feat: store 分屏与置顶状态（videoRegistry/videoSizes/windowMode/pinned + toggleGridMode/toggleMini/togglePinned），位置落盘改读 registry"
```

## Task 4: PlayerView 改造（注册/尺寸/分屏按钮/置顶按钮/激活/移除浮层）

**Files:**
- Modify: `src/renderer/src/components/PlayerView.tsx`

- [ ] **Step 1: 核心 effect 注册 video 与尺寸上报**

将 31-45 行的核心 effect 改为：

```tsx
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    useAppStore.getState().registerVideo(instanceId, video)
    const core = new PlayerCore(video, {
      onPlaying: () => useAppStore.getState().updateInstance(instanceId, { isPlaying: true }),
      onPaused: () => useAppStore.getState().updateInstance(instanceId, { isPlaying: false }),
      onEnded: () => useAppStore.getState().nextInInstance(instanceId),
      onError: (kind, message) => setError({ kind, message }),
      onLoadedMetadata: (w, h) => useAppStore.getState().setVideoSize(instanceId, w, h)
    })
    coreRef.current = core
    return () => {
      core.destroy()
      coreRef.current = null
      useAppStore.getState().registerVideo(instanceId, null)
      useAppStore.getState().setVideoSize(instanceId, 0, 0)
    }
  }, [instanceId])
```

- [ ] **Step 2: toggleMini 走 store**

将 `handleToggleMini`（102-106 行）改为：

```tsx
  const handleToggleMini = (): void => {
    void useAppStore.getState().toggleMini()
  }
```

- [ ] **Step 3: 激活状态订阅与点击激活**

组件顶部增加（`urlInputOpen` 订阅行后）：

```tsx
  const active = useAppStore((s) => s.activeInstance === instanceId)
  const viewMode = useAppStore((s) => s.viewMode)
  const pinned = useAppStore((s) => s.pinned)
```

根 div（120 行）改为：

```tsx
    <div
      className={`player-view${active ? ' active' : ''}`}
      onMouseMove={onMouseMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={() => {
        if (useAppStore.getState().activeInstance !== instanceId) {
          useAppStore.getState().setActiveInstance(instanceId)
        }
      }}
    >
```

- [ ] **Step 4: 分屏按钮 + 置顶按钮 + 小窗图标调整 + 移除 UrlInputOverlay**

`player-actions` 中「播放列表」按钮之前插入分屏按钮：

```tsx
        <button
          title={viewMode === 'grid' ? '退出分屏' : '分屏'}
          onClick={() => useAppStore.getState().toggleGridMode()}
        >
          <Icon name="grid" />
        </button>
```

「置顶小窗」按钮（pin 图标）改为置顶按钮 + 小窗按钮两组（紧邻全屏按钮之前）：

```tsx
        <button
          title={pinned ? '取消置顶' : '置顶'}
          className={`pinned-btn${pinned ? ' active' : ''}`}
          onClick={() => void useAppStore.getState().togglePinned()}
        >
          <Icon name="pin" />
        </button>
        <button title="置顶小窗" onClick={() => void handleToggleMini()}>
          <Icon name="minimize2" />
        </button>
```

删除组件尾部 157-162 行的 UrlInputOverlay 渲染，并清理 import：删除 `import UrlInputOverlay from './UrlInputOverlay'`；`openUrl`/`openUrlInput` 不再被本组件使用，从 `import { openFiles, openFolder, openUrl, openUrlInput } from '../store/openMedia'` 中移除。

- [ ] **Step 5: 类型检查与测试**

Run: `npm run typecheck; npx jest src/renderer/src/components/__tests__/playerViewResume.test.tsx`
Expected: typecheck 通过；playerViewResume 全绿（如 icons 尚缺 minimize2 名称，与 Task 7 图标任务冲突时先在本 Task 将 `minimize2`/`grid` 暂记为占位并说明，或顺序调整为 Task 4 前先完成 icons——若遇此情况报告 DONE_WITH_CONCERNS）

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/components/PlayerView.tsx
git commit -m "feat: PlayerView 注册 video/上报尺寸/分屏与置顶按钮/点击激活，网络流浮层移交 App"
```

## Task 5: 全局消费者改造（快捷键/右键菜单/控制列读 registry）

**Files:**
- Modify: `src/renderer/src/hooks/useShortcuts.ts`
- Modify: `src/renderer/src/components/ContextMenu.tsx`
- Modify: `src/renderer/src/components/ControlsBar.tsx`
- Modify: `src/renderer/src/components/__tests__/ContextMenu.test.tsx`
- Test: `src/renderer/src/hooks/__tests__/useShortcuts.test.tsx`（Create）

- [ ] **Step 1: useShortcuts 改读 registry + G/P 键**

`handler` 内（16-18 行）改为：

```ts
      const state = useAppStore.getState()
      const instanceId = state.activeInstance
      const key = event.key
      const video = state.videoRegistry[instanceId] ?? null
```

`p`/`P` 分支（52-58 行）改为：

```ts
        case 'p':
        case 'P':
          event.preventDefault()
          void state.toggleMini()
          break
```

`l`/`L` 分支后新增：

```ts
        case 'g':
        case 'G':
          event.preventDefault()
          state.toggleGridMode()
          break
```

- [ ] **Step 2: ContextMenu 改读 registry**

`togglePlay`（79-84 行）改为：

```ts
  const togglePlay = (): void => {
    const video = useAppStore.getState().videoRegistry[useAppStore.getState().activeInstance]
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }
```

- [ ] **Step 3: ControlsBar 改读 registry**

删除 27 行 `const videoRef = useRef<HTMLVideoElement | null>(null)`、36-39 行的 video 查找 effect；改为订阅：

```tsx
  const video = useAppStore((s) => s.videoRegistry[instanceId])
```

42 行 effect 改为：

```tsx
  useEffect(() => {
    if (!video) return
    const onTime = (): void => setCurrentTime(video.currentTime)
    const onDur = (): void => setDuration(video.duration)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('durationchange', onDur)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('durationchange', onDur)
    }
  }, [video])
```

`seek`/`toggleMuted` 内 `videoRef.current` 全部改为 `video`（两处）；若 `useRef` 不再被使用则从 import 移除。

- [ ] **Step 4: 更新 ContextMenu 播放/暂停测试**

`ContextMenu.test.tsx` 130-147 行的用例改为：

```tsx
  it('播放/暂停项操作活动格注册的 video（paused=true 时调用 play）', () => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'paused', { configurable: true, get: () => true })
    useAppStore.setState({ videoRegistry: { 0: video, 1: null, 2: null, 3: null } })
    renderMenu()
    const item = Array.from(container.querySelectorAll('.menu-item')).find(
      (e) => e.textContent?.includes('暂停')
    ) as HTMLElement
    act(() => {
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(video.play).toHaveBeenCalled()
  })
```

（删除 DOM wrapper 模拟代码块；`useAppStore.setState` 为浅合并，未覆盖字段保留。）

- [ ] **Step 5: 新增 useShortcuts 测试**

Create `src/renderer/src/hooks/__tests__/useShortcuts.test.tsx`：

```tsx
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useAppStore } from '../../store/appStore'
import { useShortcuts } from '../useShortcuts'

function Harness(): null {
  useShortcuts()
  return null
}

describe('useShortcuts 分屏相关', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    useAppStore.setState({
      viewMode: 'single',
      activeInstance: 1,
      videoRegistry: { 0: null, 1: null, 2: null, 3: null }
    })
    ;(window.api.window.getState as jest.Mock).mockResolvedValue({
      mode: 'window',
      bounds: { x: 0, y: 0, width: 960, height: 540 },
      pinned: false
    })
    act(() => {
      root = createRoot(container)
      root.render(<Harness />)
    })
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
      root = null
      container.remove()
    })
  })

  function press(key: string): void {
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key }))
    })
  }

  it('G 键切换分屏（大小写均可）', () => {
    press('g')
    expect(useAppStore.getState().viewMode).toBe('grid')
    press('G')
    expect(useAppStore.getState().viewMode).toBe('single')
  })

  it('空格作用于活动格注册的 video（paused=true → play）', () => {
    const v = document.createElement('video')
    Object.defineProperty(v, 'paused', { configurable: true, get: () => true })
    useAppStore.setState({ videoRegistry: { 0: null, 1: v, 2: null, 3: null } })
    press(' ')
    expect(v.play).toHaveBeenCalled()
  })

  it('P 键切换置顶小窗并联动 windowMode', async () => {
    press('p')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(window.api.window.enterMini).toHaveBeenCalled()
    expect(useAppStore.getState().windowMode).toBe('mini')
  })
})
```

- [ ] **Step 6: 运行测试**

Run: `npx jest src/renderer/src/hooks src/renderer/src/components/__tests__/ContextMenu.test.tsx`
Expected: 全部 PASS（含既有 useWindowResize/useWindowDrag/SidePanel 用例）

- [ ] **Step 7: 提交**

```bash
git add src/renderer/src/hooks/useShortcuts.ts src/renderer/src/components/ContextMenu.tsx src/renderer/src/components/ControlsBar.tsx src/renderer/src/hooks/__tests__/useShortcuts.test.tsx src/renderer/src/components/__tests__/ContextMenu.test.tsx
git commit -m "feat: 全局控制改读 videoRegistry（快捷键 G 分屏/空格作用于活动格），控制列随格独立"
```

## Task 6: App 网格渲染 + UrlInputOverlay 提升 + 窗口状态同步

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Test: `src/renderer/src/components/__tests__/App.test.tsx`（Create）

- [ ] **Step 1: 写失败测试**

```tsx
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../App'
import { useAppStore } from '../../store/appStore'

function snapshot(): Record<string, unknown> {
  const instances = [0, 1, 2, 3].map((id) => ({
    id,
    playlistId: null,
    currentIndex: 0,
    playMode: 'order' as const,
    isPlaying: false,
    volume: 1,
    rate: 1,
    scaleMode: 'contain' as const
  }))
  return {
    playlists: [],
    favorites: { id: 'favorites', name: '收藏', items: [], createdAt: 0 },
    settings: { downloadDir: '', autoResume: true },
    instances
  }
}

describe('App 分屏渲染', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    ;(window.api.store.getAll as jest.Mock).mockResolvedValue(snapshot())
    ;(window.api.window.getState as jest.Mock).mockResolvedValue({
      mode: 'window',
      bounds: { x: 0, y: 0, width: 960, height: 540 },
      pinned: false
    })
    useAppStore.setState({
      viewMode: 'single',
      windowMode: 'window',
      activeInstance: 0,
      videoRegistry: { 0: null, 1: null, 2: null, 3: null },
      videoSizes: { 0: null, 1: null, 2: null, 3: null }
    })
    await act(async () => {
      root = createRoot(container)
      root.render(<App />)
      await new Promise((r) => setTimeout(r, 0))
    })
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
      root = null
      container.remove()
    })
  })

  it('single 模式渲染 1 个 .player-view', () => {
    expect(container.querySelectorAll('.player-view')).toHaveLength(1)
  })

  it('grid 模式渲染 4 个 .player-view', () => {
    act(() => {
      useAppStore.setState({ viewMode: 'grid' })
    })
    expect(container.querySelectorAll('.player-view')).toHaveLength(4)
  })

  it('mini + grid → 渲染活动格单格', () => {
    act(() => {
      useAppStore.setState({ viewMode: 'grid', windowMode: 'mini' })
    })
    expect(container.querySelectorAll('.player-view')).toHaveLength(1)
  })

  it('点击格子切换活动格并施加 active 类', () => {
    act(() => {
      useAppStore.setState({ viewMode: 'grid' })
    })
    const views = container.querySelectorAll('.player-view')
    expect(views[0].classList.contains('active')).toBe(true)
    act(() => {
      views[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().activeInstance).toBe(1)
    expect(views[1].classList.contains('active')).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx jest src/renderer/src/components/__tests__/App.test.tsx`
Expected: FAIL（grid 模式仍渲染 1 格）

- [ ] **Step 3: 实现 App 改造**

`src/renderer/src/App.tsx` 完整改为：

```tsx
import { useEffect } from 'react'
import PlayerView from './components/PlayerView'
import SidePanel from './components/SidePanel'
import ContextMenu from './components/ContextMenu'
import UrlInputOverlay from './components/UrlInputOverlay'
import { Icon } from './components/icons'
import { useAppStore } from './store/appStore'
import { flushPositions, persistNow, persistPositionOnly } from './store/appStore'
import { openUrl } from './store/openMedia'
import { useShortcuts } from './hooks/useShortcuts'
import { useWindowDrag } from './hooks/useWindowDrag'
import { useWindowResize } from './hooks/useWindowResize'

export default function App(): React.JSX.Element {
  const activeInstance = useAppStore((s) => s.activeInstance)
  const viewMode = useAppStore((s) => s.viewMode)
  const windowMode = useAppStore((s) => s.windowMode)
  const urlInputOpen = useAppStore((s) => s.urlInputOpen)
  const hydrate = useAppStore((s) => s.hydrate)
  useShortcuts()
  const { onMouseDown } = useWindowDrag()
  const { onMouseDown: onResizeStart } = useWindowResize()

  useEffect(() => {
    window.api.store.getAll().then((snapshot) => hydrate(snapshot))
    void useAppStore.getState().syncWindowStateFromMain()
  }, [hydrate])

  useEffect(() => {
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

  const isGrid = viewMode === 'grid' && windowMode !== 'mini'

  return (
    <div className="app">
      <div className="app-titlebar" onMouseDown={onMouseDown}>
        <div className="titlebar-buttons">
          <button title="最小化" onClick={() => void window.api.window.minimize()}>
            <Icon name="minus" />
          </button>
          <button title="关闭" className="titlebar-close" onClick={() => void window.api.window.close()}>
            <Icon name="x" />
          </button>
        </div>
      </div>
      {isGrid ? (
        <div className="player-grid">
          {[0, 1, 2, 3].map((id) => (
            <PlayerView key={id} instanceId={id} />
          ))}
        </div>
      ) : (
        <PlayerView instanceId={activeInstance} />
      )}
      <div className="resize-handle" onMouseDown={onResizeStart} title="调整窗口大小" />
      <SidePanel />
      <ContextMenu />
      {urlInputOpen && (
        <UrlInputOverlay
          onCancel={() => useAppStore.getState().closeUrlInput()}
          onConfirm={(url) => openUrl(activeInstance, url)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx jest src/renderer/src/components/__tests__/App.test.tsx`
Expected: PASS（4 用例）

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/__tests__/App.test.tsx
git commit -m "feat: 分屏 2x2 网格渲染（mini 下活动格单格），网络流浮层提升至全局作用于活动格"
```

## Task 7: 图标与样式

**Files:**
- Modify: `src/renderer/src/components/icons.tsx`
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: 新增 grid 与 minimize2 图标**

`IconName` 联合类型 `'refresh'` 后追加 `| 'grid' | 'minimize2'`；`ICON_PATHS` 中 `refresh` 条目后追加：

```tsx
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </>
  ),
  minimize2: (
    <>
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </>
  )
```

- [ ] **Step 2: grid 布局与活动格描边、置顶按钮高亮**

`styles.css` 的 `.player-view` 规则（85-89 行）后追加：

```css
.player-grid {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 2px;
  background: #141416;
}

.player-view.active {
  box-shadow: inset 0 0 0 2px #ffffff;
}
```

`.fav-btn` 规则（716-718 行）后追加：

```css
.pinned-btn.active {
  color: #fe2c55;
}

.pinned-btn.active svg {
  fill: currentColor;
}
```

- [ ] **Step 3: 验证与提交**

Run: `npm run typecheck; npx jest src/renderer/src/components/__tests__/ContextMenu.test.tsx`
Expected: 无报错、测试绿

```bash
git add src/renderer/src/components/icons.tsx src/renderer/src/styles.css
git commit -m "style: 分屏 2x2 网格布局、活动格白色描边、置顶按钮高亮与最小化图标"
```

## Task 8: 收尾验证与验收

**Files:** 无新增

- [x] **Step 1: 全量验证**

```bash
npm run typecheck
npm test
npm run build
```

预期：typecheck 无报错；测试全绿（预计 107 + 新增约 25 用例）；build 成功产出 out/。

- [x] **Step 2: 手动验收（dev）**

```bash
npm run dev
```

验收清单（对应 spec 第 6 节 + 需求 11 + 用户追加需求）：

- [x] 右上「分屏」按钮与 G 键进入 2x2：窗口高度按视频比例调整（16:9 视频 960 宽 → 约 540 高）；再按 G 退出恢复单屏且不动窗口
- [x] 每格独立：各自播放列表/进度/音量/倍速；不同格可打开不同文件/文件夹/网络流
- [x] 点击格子切换活动格，白色描边跟随；空格/←→/音量键/右键菜单/收藏/列表均作用于活动格
- [x] 图钉「置顶」按钮：点击后窗口置顶、按钮变红，窗口大小位置不变；再点取消
- [x] 「置顶小窗」（minimize-2 图标）按钮：进入小窗形态；置顶状态进小窗退出后仍保持置顶
- [x] 置顶小窗（P）下渲染活动格单格，控制列可用；退出小窗恢复 2x2 且两格继续各自播放
- [x] 无视频尺寸时进入分屏不改变窗口尺寸
- [x] 鼠标静止 2.5s 各格控制列独立隐藏；边缘缩放/拖拽在分屏下正常
- [x] 回归：单屏播放/续播/收藏/面板/右键菜单/关闭落盘均正常

- [x] **Step 3: 最终提交**（git 工作区干净，无未提交内容）

---

## 实施变更记录（与实际实现差异）

以下为实施过程中对计划的修正，均已通过测试与两阶段审查：

1. **「仅置顶」需求并入**（用户追加）：主进程 `WindowManager.setPinned`（独立 try/catch，**窗口操作成功后才更新 pinned**，不触碰 mode/bounds——复用 `safe()` 会错误重置形态状态机，质量审查指出后修复）；`exitMini` 恢复 `setAlwaysOnTop(this.pinned)`；新增 `window:set-pinned` IPC + preload + setup mock
2. **icons 前置**（Task 4 时先于样式任务添加 grid/minimize2 图标，避免 JSX 编译失败）；Task 7 仅剩样式
3. **openUrlInput 决策**：PlayerView 移除 UrlInputOverlay 与 openMedia import 后，「打开网络流」按钮改直调 `useAppStore.getState().openUrlInput()`（与 helper 等价，功能保持）
4. **useShortcuts 测试修正**：jsdom `KeyboardEvent` 默认 `bubbles: false`，从 document 派发到不了 window 监听器，测试 press 需 `bubbles: true`（实现代码零改动）
5. **toggleGridMode 竞态守卫**（质量审查）：异步回调 `await getState` 后、`resizeTo` 前校验 `get().viewMode === 'grid'`，快速进-退分屏时过期回调不再改窗口
6. **视图切换进度保留**（用户决策）：`toggleGridMode`/`toggleMini` 切换前调用 `flushPositions()` + `schedulePersist()`，重挂载后 autoResume 续播（非无缝）；网络流浮层确认后追加 `closeUrlInput()`（修复既有「确认后浮层不自动关闭」bug）
7. **活动格描边**：`inset box-shadow` 被不透明 video 覆盖不可见 → 改用 `.player-view.active::after` 伪元素（白色 2px、pointer-events: none、z-index 5）
8. **测试规模**：P4 结束时 138 用例全绿（16 套件）；typecheck/build 通过；零新增依赖

## 验收后修复记录

1. **分屏窗口尺寸算法重做**（用户验收反馈：16:9 时窗口不变、竖屏时高度爆屏）：
   - 原「保持当前宽度、高=宽/比例」在 16:9 视频+16:9 窗口下高度不变（正确但无感知），竖屏 9:16 视频高度 1706px 爆屏（主进程 1.5 倍工作区钳制仍超）
   - 中间方案（`07d78aa`）改面积守恒+屏幕钳制：W=sqrt(S·R)、H=sqrt(S/R)，解决竖屏爆屏，但**面积守恒把非 16:9 窗口做小**（4:3 视频+960x540 窗口 → 831x624、格子仅 415 宽）→ 用户反馈显示不全
   - **最终方案（`57f2f3a`）**：宽度 = max(当前宽, 960)（小窗口放大保证每格 ≥480 完整显示；大窗口保持宽度心智）→ 高 = 宽/平均宽高比 → 钳制工作区 95%（先高后宽、保持比例）→ 下限 480x320；`computeGridBounds` 可选 `screen` 参数（渲染进程传 `window.screen.availWidth/availHeight`）
   - 效果：16:9 视频+960 宽窗口不变；4:3 → 960x720（格子 480x360 完整）；竖屏 → 480x821（不爆屏）；小窗口 500 宽 → 放大 960x540
2. **缩放手柄拖出窗口事件丢失**（用户反馈：分屏高度不跟随大窗口；主进程日志实证窗口卡在 480x320 无法放大）：`useWindowResize` 改 Pointer Events + `setPointerCapture`（`882e1e1`），按住手柄后鼠标拖出窗口 pointermove 持续派发，窗口可向窗外放大
3. **取消最小尺寸限制 + 紧凑模式**（用户决策）：移除 `useWindowResize`/主进程 `resizeTo`/`BrowserWindow minWidth/minHeight`/`computeGridBounds` 的 480x320 下限（`905b099`）；窗口 < 480x320 时 `.app.compact` 隐藏标题栏/标题/按钮组/控制列，仅保留播放区域与缩放手柄（拖大自动恢复）；mini 模式例外（保留控制列）
4. **分屏布局反复确认**（用户最终目标：**格子等分铺满窗口**，视频格内 contain 自适应，窗口变化格子跟随铺满）：
   - `8d735c8` contain 居中网格（网格保持视频比例、四周黑边）→ 用户确认要「铺满窗口」→ `f233073` 回退
   - 中间发现 `aspect-ratio` 会被内容撑破（日志实证 grid 665px > 视口 511px、上下裁剪）→ `c44e863` 改 JS 显式尺寸
   - `45c039e` 窗口 resize 时 JS 重新计算网格尺寸（= 视口）并显式注入，保证 4 分屏始终完整铺满展示
5. **分屏格子被视频固有尺寸撑破**（用户反馈：内容大过分屏大小）：grid 轨道 `1fr` 默认 `minmax(auto, 1fr)`，高清视频 min-content 把轨道撑大溢出窗口 → 改 `minmax(0, 1fr)` + `.player-view` 加 `min-width/min-height: 0` + `.player-video` 加 `max-width/max-height: 100%` 兜底（`b68785c`）
6. **最终测试规模**：152 用例全绿（16 套件）；typecheck/build 通过；零新增依赖

## P4 实施完成记录（2026-08-08）

- **8/8 Task 全部完成**，提交 4427897..eaf1e42（14 个提交），两阶段审查（spec 合规 + 代码质量）逐 Task 通过
- **全量验证**：`npm run typecheck` 无报错；`npm test` 16 套件 139 用例全绿；`npm run build` 成功
- **最终整体审查**：批准合入；修复 Esc 退出小窗同步（windowMode 脱节）；`mediaService` createdAt 毫秒级偶发竞态为 P4 前既有问题（重跑即过），建议后续放宽断言
- **验收通过（用户 2026-08-08 确认）**：P4 分屏 + 仅置顶全部验收通过；验收期间 5 轮实测修复（窗口尺寸算法重做、Pointer Capture 缩放、取消最小限制+紧凑模式、分屏布局铺满确认、grid 轨道 minmax 防撑破），最终 152 用例全绿（16 套件）
- **待进行**：**P5 m3u8 下载转 MP4**（需求 10：ffmpeg-static remux `-c copy`、进度上报、下载任务管理）——需先编写 P5 实现计划（writing-plans）后按阶段执行

## 自我审查记录（Self-Review）

**Spec 覆盖：** 需求 11 + 第 6 节全部要点 → Task 1（尺寸纯函数）、Task 3（store）、Task 6/7（布局与高亮）、Task 4/5（每格独立控制 + 全局作用活动格）；spec §4「分屏实例规则」→ Task 3/6；spec §8 快捷键 G → Task 5；「仅置顶」追加需求 → Task 2（主进程 setPinned 不动 bounds/mode）+ Task 3/4（togglePinned + 图钉按钮）；「切换视频绝不触碰窗口 bounds」约束 → 仅 `toggleGridMode` 进入时一次 `resizeTo`，置顶仅动 alwaysOnTop，其余路径零窗口操作。

**占位符扫描：** 所有步骤均含完整代码与命令，无 TBD/TODO（Task 4 Step 5 的 icons 依赖已在 Task 7 覆盖，若实施顺序冲突按计划说明处理）。

**类型一致性：** `computeGridBounds(sizes: Array<VideoSize | null>, current: Rect): Rect | null`（Task 1）在 Task 3 `toggleGridMode` 中按 `[0,1,2,3].map(id => videoSizes[id] ?? null)` 调用，返回 null 时不调 resizeTo；`videoRegistry: Record<number, HTMLVideoElement | null>` 初始 `{0:null,...}` 在 appStore 与全部测试 beforeEach 中一致；`setVideoSize(id, 0, 0)` 清除语义与 `computeGridBounds` 的 `w>0&&h>0` 过滤一致；`WindowState.pinned` 在主进程 windowManager、shared/types、getState mock（setup.ts/各测试）中一致；`toggleMini`/`setWindowMode`/`togglePinned`/`syncWindowStateFromMain` 在 useShortcuts/PlayerView/App 中引用统一。测试用 `useAppStore.setState` 均为浅合并，未覆盖的既有字段保留，不破坏现有用例（ContextMenu 播放/暂停用例显式注册 registry）。
