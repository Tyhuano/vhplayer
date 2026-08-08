# VHplayer P1：脚手架 + 主进程实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 初始化 Electron + React + Vite 工程，交付主进程四个核心服务（窗口形态状态机/存储/对话框/IPC 桥）与渲染进程骨架，全部单元测试通过。

**Architecture:** electron-vite 三段构建（main/preload/renderer），CJS 输出保证 preload 沙箱兼容；主进程服务全部面向接口设计（`WindowLike`/`StoreBackend`）以支持 Jest 注入测试；渲染进程经 contextBridge 暴露的 `window.api` 访问主进程。

**Tech Stack:** Electron + electron-vite + React + Vite + TypeScript + Zustand + electron-store@8 + Jest + ts-jest

**权威 spec:** `docs/superpowers/specs/2026-08-08-vhplayer-design.md`

---

## 轻量资源约束（贯穿本计划及后续所有阶段）

用户明确要求轻量化，以下为本计划必须遵守的硬性约束：

1. **依赖最小化**：`dependencies`（打包时随应用分发）仅 4 个：`react`、`react-dom`、`zustand`、`electron-store@8`。ffmpeg-static（约 80MB）在 P5 才引入，hls.js/flv.js 在 P2 引入，electron-builder 在 P6 引入。禁止引入 UI 组件库。
2. **窗口创建轻量**：`show: false` + `ready-to-show` 后显示（避免白屏双帧绘制）；`backgroundColor: '#000000'`；dev 模式不自动打开 DevTools（不自动调用 `openDevTools`）。
3. **不保留多余引用**：主进程窗口对象只被主入口持有，服务类不缓存 BrowserWindow 以外的全局单例。
4. **生产构建优化**：electron-vite 生产模式默认 minify + tree-shaking，无需额外配置。
5. **渲染进程**：React 生产模式（electron-vite 默认），不启用任何不必要的 polyfill/插件。
6. **测试与构建隔离**：Jest/ts-jest/类型等全部为 devDependencies，不会被 electron-builder 打进安装包。

---

## 文件结构（本计划最终交付）

```
D:\vswork\VHplayer\
├── .gitignore
├── package.json
├── tsconfig.json
├── electron.vite.config.ts
├── jest.config.js
├── docs/superpowers/plans/2026-08-08-vhplayer-p1-scaffold-main.md
└── src/
    ├── shared/types.ts                数据模型 + IPC 通道常量 + IpcApi 类型（三端共用）
    ├── main/
    │   ├── index.ts                   app 生命周期 + 创建窗口 + 注册 IPC
    │   ├── windowManager.ts           窗口形态状态机（面向 WindowLike 接口）
    │   ├── storeService.ts            注入式存储服务 + 内存后端 + electron-store 适配
    │   ├── dialogService.ts           打开文件夹/文件/保存对话框
    │   ├── ipc.ts                     IPC handler 注册
    │   └── __tests__/
    │       ├── windowManager.test.ts
    │       └── storeService.test.ts
    ├── preload/index.ts               contextBridge 暴露 window.api
    └── renderer/
        ├── index.html
        └── src/
            ├── main.tsx
            ├── App.tsx
            ├── env.d.ts
            ├── styles.css
            └── store/appStore.ts      Zustand 骨架（4 实例槽位等初始状态）
```

---

## Task 1: 脚手架初始化

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "vhplayer",
  "version": "0.1.0",
  "description": "轻量沉浸式 Electron 视频播放器",
  "main": "./out/main/index.js",
  "license": "MIT",
  "private": true,
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck": "tsc --noEmit",
    "test": "jest"
  }
}
```

- [ ] **Step 2: 创建 .gitignore**

```
node_modules/
out/
dist/
*.log
.DS_Store
*.local
```

- [ ] **Step 3: 安装依赖**（dependencies 严格最小化；electron 二进制由 npm 下载）

```bash
npm install react react-dom zustand electron-store@8
npm install -D electron electron-vite vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node jest ts-jest @types/jest
```

预期：安装成功，`npm ls react zustand electron-store` 显示已装且无 peer 冲突。

- [ ] **Step 4: git init 并初始提交**（仅本地，不上传任何平台）

```bash
git init -b main
git add package.json package-lock.json .gitignore
git commit -m "chore: 初始化项目脚手架"
```

验证：`git log --oneline` 显示 1 条提交。

---

## Task 2: 构建配置与三端最小骨架

**Files:**
- Create: `tsconfig.json`
- Create: `electron.vite.config.ts`
- Create: `jest.config.js`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/styles.css`
- Create: `src/renderer/src/env.d.ts`

- [ ] **Step 1: 创建 tsconfig.json**（单配置合并三端；lib 取并集，types 取 node + vite/client）

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["node", "vite/client"],
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["electron.vite.config.ts", "jest.config.js", "src"]
}
```

- [ ] **Step 2: 创建 electron.vite.config.ts**

```ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()]
  }
})
```

- [ ] **Step 3: 创建 jest.config.js**（ts-jest 内联覆盖 module 为 CJS，供 Node 环境执行）

```js
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          strict: true,
          target: 'ES2022',
          lib: ['ES2022'],
          types: ['node', 'jest'],
          skipLibCheck: true
        }
      }
    ]
  },
  moduleFileExtensions: ['ts', 'js', 'json']
}
```

- [ ] **Step 4: 创建主进程最小入口 src/main/index.ts**（frameless + resizable，轻量启动）

```ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 960,
    height: 540,
    minWidth: 480,
    minHeight: 320,
    frame: false,
    resizable: true,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 5: 创建最小 preload src/preload/index.ts**（Task 6 补全 API）

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {})
```

- [ ] **Step 6: 创建渲染进程入口 src/renderer/index.html**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VHplayer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: 创建 src/renderer/src/main.tsx**

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 8: 创建 src/renderer/src/styles.css**（沉浸式深色基调）

```css
html,
body,
#root {
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: #000;
  color: #f5f5f5;
  user-select: none;
  cursor: default;
  font-family: system-ui, 'Microsoft YaHei', sans-serif;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.titlebar {
  -webkit-app-region: drag;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.stage {
  -webkit-app-region: no-drag;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.35);
}
```

- [ ] **Step 9: 创建 src/renderer/src/App.tsx**（P1 占位）

```tsx
export default function App(): React.JSX.Element {
  return (
    <div className="app">
      <header className="titlebar">VHplayer</header>
      <main className="stage">播放区域（后续阶段填充）</main>
    </div>
  )
}
```

- [ ] **Step 10: 创建 src/renderer/src/env.d.ts**（Task 6 补全 api 类型）

```ts
/// <reference types="vite/client" />
export {}
```

- [ ] **Step 11: 验证构建**

```bash
npm run typecheck
npm run build
```

预期：typecheck 无报错；build 产出 `out/main/index.js`、`out/preload/index.js`、`out/renderer/index.html`。

- [ ] **Step 12: 手动验证 dev 启动**

```bash
npm run dev
```

预期：弹出 960x540 无边框黑色窗口，顶部显示 "VHplayer" 占位。确认后关闭窗口（ctrl+c 退出 dev）。若 electron 二进制下载缺失则重装 electron。

- [ ] **Step 13: 提交**

```bash
git add -A
git commit -m "chore: 构建配置与三端最小骨架"
```

---

## Task 3: 共享数据模型

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: 创建 src/shared/types.ts**（spec 第 4 节数据模型原样落码 + IPC 通道常量 + IpcApi）

```ts
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
```

- [ ] **Step 2: 验证**

```bash
npm run typecheck
```

预期：无报错。

- [ ] **Step 3: 提交**

```bash
git add src/shared/types.ts
git commit -m "feat: 共享数据模型与 IPC API 类型"
```

---

## Task 4: 窗口形态状态机（TDD）

**Files:**
- Test: `src/main/__tests__/windowManager.test.ts`
- Create: `src/main/windowManager.ts`

### 设计要点
- 面向 `WindowLike` 接口（`setFullScreen`/`setAlwaysOnTop`/`setBounds`/`getBounds`），真实 BrowserWindow 由 ipc.ts 适配传入，测试注入 mock。
- 状态机规则：
  - `window` → `fullscreen`：仅 `setFullScreen(true)`，**绝不触碰 bounds**。
  - `window` → `mini`：先记录当前 bounds 为 `windowBounds`；mini 尺寸 = 目标宽 420 按宽高比换算高度，高度小于 280 时固定高 280 反向换算宽度；以原窗口中心定位；`setAlwaysOnTop(true)`。
  - `fullscreen` → `mini`：先退全屏（`setFullScreen(false)`），再按上述逻辑进 mini。
  - `mini` → `window`：`setAlwaysOnTop(false)` + `setBounds(windowBounds)`，清空记录。
  - 任何窗口操作抛错 → 回退 `mode = 'window'`。
  - `getState()` 返回当前模式与实时 bounds（全屏模式 bounds 返回内部记录的 windowBounds，避免依赖真实窗口查询）。

- [ ] **Step 1: 写失败测试 src/main/__tests__/windowManager.test.ts**

```ts
import { WindowManager, type WindowLike, type WindowMode } from '../windowManager'

function createMockWindow(): {
  mock: WindowLike
  calls: { setFullScreen: boolean[]; setAlwaysOnTop: boolean[]; setBounds: unknown[] }
} {
  const calls = { setFullScreen: [] as boolean[], setAlwaysOnTop: [] as boolean[], setBounds: [] as unknown[] }
  const mock: WindowLike = {
    setFullScreen: (flag) => {
      calls.setFullScreen.push(flag)
    },
    setAlwaysOnTop: (flag) => {
      calls.setAlwaysOnTop.push(flag)
    },
    setBounds: (bounds) => {
      calls.setBounds.push(bounds)
    },
    getBounds: () => ({ x: 100, y: 100, width: 960, height: 540 })
  }
  return { mock, calls }
}

describe('WindowManager', () => {
  const modeOf = (wm: WindowManager): WindowMode => wm.getState().mode

  it('初始为 window 模式', () => {
    const { mock } = createMockWindow()
    const wm = new WindowManager(mock)
    expect(modeOf(wm)).toBe('window')
  })

  it('进入全屏只 setFullScreen(true)，不触碰 bounds', () => {
    const { mock, calls } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.enterFullscreen()
    expect(modeOf(wm)).toBe('fullscreen')
    expect(calls.setFullScreen).toEqual([true])
    expect(calls.setBounds).toEqual([])
  })

  it('重复进入全屏是幂等的', () => {
    const { mock, calls } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.enterFullscreen()
    wm.enterFullscreen()
    expect(calls.setFullScreen).toEqual([true])
  })

  it('退出全屏恢复 window 模式并还原 bounds', () => {
    const { mock, calls } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.enterFullscreen()
    wm.exitFullscreen()
    expect(modeOf(wm)).toBe('window')
    expect(calls.setFullScreen).toEqual([true, false])
    expect(calls.setBounds).toEqual([{ x: 100, y: 100, width: 960, height: 540 }])
  })

  it('从 window 进入 mini：记录原 bounds、按比例缩小并置顶', () => {
    const { mock, calls } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.enterMini()
    expect(modeOf(wm)).toBe('mini')
    expect(calls.setAlwaysOnTop).toEqual([true])
    expect(calls.setBounds).toEqual([
      { x: 331, y: 230, width: 498, height: 280 }
    ])
  })

  it('退出 mini：取消置顶并还原原 bounds', () => {
    const { mock, calls } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.enterMini()
    wm.exitMini()
    expect(modeOf(wm)).toBe('window')
    expect(calls.setAlwaysOnTop).toEqual([true, false])
    expect(calls.setBounds).toEqual([
      { x: 331, y: 230, width: 498, height: 280 },
      { x: 100, y: 100, width: 960, height: 540 }
    ])
  })

  it('从全屏进入 mini：先退全屏再缩小', () => {
    const { mock, calls } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.enterFullscreen()
    wm.enterMini()
    expect(modeOf(wm)).toBe('mini')
    expect(calls.setFullScreen).toEqual([true, false])
    expect(calls.setAlwaysOnTop).toEqual([true])
  })

  it('从 mini 退出直接回 window，并还原全屏前记录的 bounds', () => {
    const { mock, calls } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.enterFullscreen()
    wm.enterMini()
    wm.exitMini()
    expect(modeOf(wm)).toBe('window')
    expect(calls.setBounds).toEqual([
      { x: 331, y: 230, width: 498, height: 280 },
      { x: 100, y: 100, width: 960, height: 540 }
    ])
  })

  it('切换形态期间窗口操作抛错时回退 window 模式', () => {
    const failing: WindowLike = {
      setFullScreen: () => {
        throw new Error('boom')
      },
      setAlwaysOnTop: () => {
        throw new Error('boom')
      },
      setBounds: () => {
        throw new Error('boom')
      },
      getBounds: () => ({ x: 0, y: 0, width: 800, height: 450 })
    }
    const wm = new WindowManager(failing)
    wm.enterFullscreen()
    expect(modeOf(wm)).toBe('window')
    wm.enterMini()
    expect(modeOf(wm)).toBe('window')
  })

  it('全屏模式下 getState 返回内部记录的 window bounds', () => {
    const { mock } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.enterFullscreen()
    expect(wm.getState().bounds).toEqual({ x: 100, y: 100, width: 960, height: 540 })
  })

  it('toggleFullscreen 在两种形态间切换', () => {
    const { mock, calls } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.toggleFullscreen()
    expect(modeOf(wm)).toBe('fullscreen')
    wm.toggleFullscreen()
    expect(modeOf(wm)).toBe('window')
    expect(calls.setFullScreen).toEqual([true, false])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx jest src/main/__tests__/windowManager.test.ts
```

预期：FAIL（Cannot find module '../windowManager'）。

- [ ] **Step 3: 实现 src/main/windowManager.ts**

```ts
export type WindowMode = 'window' | 'fullscreen' | 'mini'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowLike {
  setFullScreen(flag: boolean): void
  setAlwaysOnTop(flag: boolean): void
  setBounds(bounds: Rect): void
  getBounds(): Rect
}

export interface WindowState {
  mode: WindowMode
  bounds: Rect
}

const MINI_WIDTH = 420
const MINI_MIN_HEIGHT = 280

export class WindowManager {
  private mode: WindowMode = 'window'
  private windowBounds: Rect | null = null

  constructor(private readonly win: WindowLike) {}

  getState(): WindowState {
    return {
      mode: this.mode,
      bounds: this.mode === 'fullscreen' && this.windowBounds ? this.windowBounds : this.win.getBounds()
    }
  }

  enterFullscreen(): void {
    if (this.mode === 'fullscreen') return
    this.safe(() => {
      if (this.mode === 'window') this.windowBounds = this.win.getBounds()
      this.win.setFullScreen(true)
      this.mode = 'fullscreen'
    })
  }

  exitFullscreen(): void {
    if (this.mode !== 'fullscreen') return
    this.safe(() => {
      this.win.setFullScreen(false)
      if (this.windowBounds) this.win.setBounds(this.windowBounds)
      this.mode = 'window'
    })
  }

  toggleFullscreen(): void {
    if (this.mode === 'fullscreen') this.exitFullscreen()
    else this.enterFullscreen()
  }

  enterMini(): void {
    if (this.mode === 'mini') return
    this.safe(() => {
      if (this.mode === 'fullscreen') {
        this.win.setFullScreen(false)
      }
      if (!this.windowBounds) this.windowBounds = this.win.getBounds()
      const base = this.windowBounds
      const targetWidth = MINI_WIDTH
      let targetHeight = Math.round((targetWidth * base.height) / base.width)
      let width = targetWidth
      if (targetHeight < MINI_MIN_HEIGHT) {
        targetHeight = MINI_MIN_HEIGHT
        width = Math.round((targetHeight * base.width) / base.height)
      }
      const cx = base.x + base.width / 2
      const cy = base.y + base.height / 2
      this.win.setBounds({
        x: Math.round(cx - width / 2),
        y: Math.round(cy - targetHeight / 2),
        width,
        height: targetHeight
      })
      this.win.setAlwaysOnTop(true)
      this.mode = 'mini'
    })
  }

  exitMini(): void {
    if (this.mode !== 'mini') return
    this.safe(() => {
      this.win.setAlwaysOnTop(false)
      if (this.windowBounds) this.win.setBounds(this.windowBounds)
      this.windowBounds = null
      this.mode = 'window'
    })
  }

  private safe(action: () => void): void {
    try {
      action()
    } catch {
      this.mode = 'window'
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx jest src/main/__tests__/windowManager.test.ts
```

预期：PASS，11 个用例全绿。

- [ ] **Step 5: 提交**

```bash
git add src/main/windowManager.ts src/main/__tests__/windowManager.test.ts
git commit -m "feat: 窗口形态状态机（window/fullscreen/mini）"
```

---

## Task 5: 存储服务（TDD）

**Files:**
- Test: `src/main/__tests__/storeService.test.ts`
- Create: `src/main/storeService.ts`

### 设计要点
- `StoreBackend` 接口（get/set/delete/has）；`createMemoryBackend()` 供测试与默认兜底；`createElectronStoreBackend()` 适配 electron-store（electron-store 是唯一真实依赖）。
- `StoreService` 只依赖接口，round-trip 测试完全不触碰 electron 环境。

- [ ] **Step 1: 写失败测试 src/main/__tests__/storeService.test.ts**

```ts
import { createMemoryBackend, StoreService } from '../storeService'
import type { Playlist, PlayerInstance, Settings } from '../../shared/types'

describe('StoreService', () => {
  function createService(): { service: StoreService; backend: ReturnType<typeof createMemoryBackend> } {
    const backend = createMemoryBackend()
    return { service: new StoreService(backend), backend }
  }

  it('未写入时返回默认值', () => {
    const { service } = createService()
    expect(service.getPlaylists()).toEqual([])
    expect(service.getSettings()).toEqual({ downloadDir: '', autoResume: true })
    expect(service.getInstances()).toHaveLength(4)
  })

  it('playlists round-trip', () => {
    const { service } = createService()
    const playlists: Playlist[] = [
      {
        id: 'p1',
        name: '测试列表',
        items: [{ id: 'm1', title: '视频一', sourceType: 'm3u8', value: 'https://example.com/a.m3u8', lastPosition: 12.5 }],
        createdAt: 1723000000000
      }
    ]
    service.savePlaylists(playlists)
    expect(service.getPlaylists()).toEqual(playlists)
  })

  it('favorites round-trip', () => {
    const { service } = createService()
    const fav: Playlist = {
      id: 'favorites',
      name: '收藏',
      items: [{ id: 'f1', title: '喜欢', sourceType: 'url', value: 'https://example.com/v.mp4' }],
      createdAt: 1723000000000
    }
    service.saveFavorites(fav)
    expect(service.getFavorites()).toEqual(fav)
  })

  it('settings round-trip', () => {
    const { service } = createService()
    const settings: Settings = { downloadDir: 'D:/download', autoResume: false }
    service.saveSettings(settings)
    expect(service.getSettings()).toEqual(settings)
  })

  it('instances round-trip（含独立音量/倍速/模式）', () => {
    const { service } = createService()
    const instances: PlayerInstance[] = [0, 1, 2, 3].map(
      (id): PlayerInstance => ({
        id,
        playlistId: id === 0 ? 'p1' : null,
        currentIndex: id,
        playMode: id === 2 ? 'random' : 'order',
        isPlaying: false,
        volume: id === 0 ? 0.5 : 1,
        rate: id === 1 ? 1.5 : 1,
        scaleMode: 'contain'
      })
    )
    service.saveInstances(instances)
    expect(service.getInstances()).toEqual(instances)
  })

  it('重复 save 覆盖旧值，不累积', () => {
    const { service } = createService()
    service.savePlaylists([{ id: 'a', name: 'A', items: [], createdAt: 1 }])
    service.savePlaylists([{ id: 'b', name: 'B', items: [], createdAt: 2 }])
    expect(service.getPlaylists()).toEqual([{ id: 'b', name: 'B', items: [], createdAt: 2 }])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx jest src/main/__tests__/storeService.test.ts
```

预期：FAIL（Cannot find module '../storeService'）。

- [ ] **Step 3: 实现 src/main/storeService.ts**

```ts
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

export function createElectronStoreBackend(): StoreBackend {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Store = require('electron-store') as new () => {
    get(key: string): unknown
    set(key: string, value: unknown): void
    delete(key: string): void
    has(key: string): boolean
  }
  const store = new Store()
  return {
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
    delete: (key) => store.delete(key),
    has: (key) => store.has(key)
  }
}

const DEFAULT_SETTINGS: Settings = { downloadDir: '', autoResume: true }

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
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx jest src/main/__tests__/storeService.test.ts
```

预期：PASS，6 个用例全绿。

- [ ] **Step 5: 提交**

```bash
git add src/main/storeService.ts src/main/__tests__/storeService.test.ts
git commit -m "feat: 注入式存储服务与 round-trip 测试"
```

---

## Task 6: 对话框 + IPC + preload 完整 API

**Files:**
- Create: `src/main/dialogService.ts`
- Create: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`
- Modify: `src/main/index.ts`（调用 registerIpc）

- [ ] **Step 1: 创建 src/main/dialogService.ts**

```ts
import { BrowserWindow, dialog } from 'electron'

export class DialogService {
  constructor(private readonly win: BrowserWindow) {}

  async openFolder(): Promise<string | null> {
    const result = await dialog.showOpenDialog(this.win, {
      properties: ['openDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  }

  async openFile(): Promise<string[] | null> {
    const result = await dialog.showOpenDialog(this.win, {
      properties: ['openFile'],
      filters: [
        { name: '媒体文件', extensions: ['mp4', 'webm', 'ogv', 'mov', 'm3u8', 'flv', 'mkv'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    return result.canceled ? null : result.filePaths
  }

  async save(defaultName: string): Promise<string | null> {
    const result = await dialog.showSaveDialog(this.win, {
      defaultPath: defaultName,
      filters: [{ name: 'VHplayer 播放列表', extensions: ['mhlb'] }]
    })
    return result.canceled ? null : (result.filePath ?? null)
  }
}
```

- [ ] **Step 2: 创建 src/main/ipc.ts**（BrowserWindow 适配为 WindowLike 传入状态机）

```ts
import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../shared/types'
import { WindowManager } from './windowManager'
import { DialogService } from './dialogService'

export function registerIpc(win: BrowserWindow): void {
  const windowManager = new WindowManager({
    setFullScreen: (flag) => win.setFullScreen(flag),
    setAlwaysOnTop: (flag) => win.setAlwaysOnTop(flag),
    setBounds: (bounds) => win.setBounds(bounds),
    getBounds: () => win.getBounds()
  })
  const dialog = new DialogService(win)

  ipcMain.handle(IPC.windowEnterFullscreen, () => windowManager.enterFullscreen())
  ipcMain.handle(IPC.windowExitFullscreen, () => windowManager.exitFullscreen())
  ipcMain.handle(IPC.windowToggleFullscreen, () => windowManager.toggleFullscreen())
  ipcMain.handle(IPC.windowEnterMini, () => windowManager.enterMini())
  ipcMain.handle(IPC.windowExitMini, () => windowManager.exitMini())
  ipcMain.handle(IPC.windowGetState, () => windowManager.getState())

  ipcMain.handle(IPC.dialogOpenFolder, () => dialog.openFolder())
  ipcMain.handle(IPC.dialogOpenFile, () => dialog.openFile())
  ipcMain.handle(IPC.dialogSave, (_event, defaultName: string) => dialog.save(defaultName))
}
```

- [ ] **Step 3: 更新 src/preload/index.ts**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type IpcApi } from '../shared/types'

const api: IpcApi = {
  window: {
    enterFullscreen: () => ipcRenderer.invoke(IPC.windowEnterFullscreen),
    exitFullscreen: () => ipcRenderer.invoke(IPC.windowExitFullscreen),
    toggleFullscreen: () => ipcRenderer.invoke(IPC.windowToggleFullscreen),
    enterMini: () => ipcRenderer.invoke(IPC.windowEnterMini),
    exitMini: () => ipcRenderer.invoke(IPC.windowExitMini),
    getState: () => ipcRenderer.invoke(IPC.windowGetState)
  },
  dialog: {
    openFolder: () => ipcRenderer.invoke(IPC.dialogOpenFolder),
    openFile: () => ipcRenderer.invoke(IPC.dialogOpenFile),
    save: (defaultName) => ipcRenderer.invoke(IPC.dialogSave, defaultName)
  }
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 4: 更新 src/renderer/src/env.d.ts**

```ts
/// <reference types="vite/client" />
import type { IpcApi } from '../../shared/types'

declare global {
  interface Window {
    api: IpcApi
  }
}

export {}
```

- [ ] **Step 5: 更新 src/main/index.ts**（引入 registerIpc）

```ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 960,
    height: 540,
    minWidth: 480,
    minHeight: 320,
    frame: false,
    resizable: true,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  registerIpc(win)

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 6: 验证**

```bash
npm run typecheck
npm run build
npx jest
```

预期：typecheck 无报错；build 成功；全部单元测试 PASS（17 个）。

- [ ] **Step 7: 提交**

```bash
git add src/main src/preload src/renderer/src/env.d.ts
git commit -m "feat: 对话框服务与 IPC 桥（窗口形态/对话框通道）"
```

---

## Task 7: 渲染进程骨架（Zustand + 沉浸式布局）

**Files:**
- Create: `src/renderer/src/store/appStore.ts`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: 创建 src/renderer/src/store/appStore.ts**（spec 数据模型初始状态；actions 留待 P2/P3）

```ts
import { create } from 'zustand'
import type { AppState, PlayerInstance } from '../../../shared/types'

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

export const useAppStore = create<AppState>(() => ({
  viewMode: 'single',
  activeInstance: 0,
  instances: [0, 1, 2, 3].map(emptyInstance),
  playlists: [],
  favorites: { id: 'favorites', name: '收藏', items: [], createdAt: 0 },
  settings: { downloadDir: '', autoResume: true }
}))
```

- [ ] **Step 2: 更新 src/renderer/src/App.tsx**（读取 store 展示占位信息）

```tsx
import { useAppStore } from './store/appStore'

export default function App(): React.JSX.Element {
  const viewMode = useAppStore((s) => s.viewMode)
  const activeInstance = useAppStore((s) => s.activeInstance)
  const instanceCount = useAppStore((s) => s.instances.length)

  return (
    <div className="app">
      <header className="titlebar">VHplayer</header>
      <main className="stage">
        模式 {viewMode} · 活动格 {activeInstance + 1}/{instanceCount}（后续阶段填充）
      </main>
    </div>
  )
}
```

- [ ] **Step 3: 验证**

```bash
npm run typecheck
npm run build
```

预期：无报错，build 成功。

- [ ] **Step 4: 提交**

```bash
git add src/renderer
git commit -m "feat: 渲染进程 Zustand 骨架与沉浸式占位布局"
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

预期：typecheck 无报错；测试 17 个全绿；build 产出 out/ 三个目标。

- [ ] **Step 2: 手动验收（dev）**

```bash
npm run dev
```

验收清单（P1 范围）：
- [ ] 无边框黑色窗口出现（960x540），顶部细条显示 "VHplayer"，主区占位文案正确
- [ ] 窗口四边/四角可拖拽改变大小（系统原生 resizable），最小尺寸受限（480x320）
- [ ] 顶部细条可拖动窗口（-webkit-app-region: drag），主区不可拖动窗口
- [ ] 无白屏闪烁（ready-to-show 后显示）
- [ ] dev 模式未自动弹出 DevTools（轻量要求）

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "chore: P1 脚手架与主进程交付（如需）"
```

（若无未提交内容则跳过）

---

## 自我审查记录（Self-Review）

**Spec 覆盖：** P1 仅覆盖 spec 第 3 节架构主进程部分 + 第 4 节数据模型 + 第 5 节窗口形态 + 第 10 节测试策略（状态机/存储 round-trip）。其余需求在 P2-P6 覆盖，无遗漏。

**占位符扫描：** 所有代码步骤均给出完整实现，无 "TBD/TODO/类似 Task N" 表述。

**类型一致性：** `WindowState`/`WindowLike`/`Rect`/`StoreBackend`/`IpcApi`/`IPC` 常量在后文任务（P2 快捷键、P4 分屏、P5 下载）中直接复用；`appStore` 初始状态与 spec 数据模型字段一一对应。
