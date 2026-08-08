# VHplayer P2：单屏播放器实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可用的单屏播放器：PlayerCore 播放内核（hls.js/flv.js/原生多引擎 + 完整销毁释放）、PlayerView 集成、ControlsBar 控制列（2.5s 鼠标静止隐藏）、全局快捷键、记忆播放位置持久化。

**Architecture:** 播放核心为框架无关的 TS 类（面向 `HTMLVideoElement` + 事件回调，可 Jest 测试）；渲染组件薄层只做生命周期绑定与状态同步；源类型判定/文件 URL 转换等纯函数放 `src/shared/` 三端复用；持久化经主进程 StoreService 快照通道（节流 5s + 窗口关闭时强制保存）。

**Tech Stack:** hls.js + flv.js + HTML5 video + Zustand + Jest(jsdom)

**前置依赖:** P1 已完成（脚手架/状态机/存储/IPC）。权威 spec：`docs/superpowers/specs/2026-08-08-vhplayer-design.md`；P1 计划：`docs/superpowers/plans/2026-08-08-vhplayer-p1-scaffold-main.md`

---

## 轻量资源约束（延续 P1 硬性要求）

1. 播放引擎销毁即释放：hls.js `destroy()` / flv.js `destroy()` 必须调用；`PlayerCore.destroy()` 移除全部事件监听并清空 video src，杜绝泄漏。
2. 持久化节流：状态变更合并为每 5s 一次快照写盘；窗口关闭时强制一次。
3. 不做 UI 组件库；图标用内联 SVG（几个 path，不引入字体/图标包）。
4. 新增依赖仅：`hls.js`、`flv.js`（dependencies）；`jsdom`、`@types/flv.js`（devDependencies）。
5. 切换媒体绝不触碰窗口 bounds/形态（延续 spec 第 5 节核心约束）。

---

## 文件结构（本计划最终交付）

```
src/
├── shared/
│   ├── types.ts                    修改：StoreSnapshot + 新 IPC 常量 + IpcApi 扩展
│   └── source.ts                   新增：源类型判定/toFileUrl/titleFromPath/uid（纯函数，TDD）
├── main/
│   ├── mediaService.ts             新增：文件夹媒体扫描（TDD）
│   ├── storeService.ts             修改：getAll/saveAll 快照
│   ├── ipc.ts                      修改：注册 store/媒体/关闭通道
│   ├── index.ts                    修改：close 拦截 → 通知渲染保存 → 确认后销毁（带 1.5s 超时兜底）
│   └── __tests__/
│       ├── source.test.ts          新增
│       ├── mediaService.test.ts    新增
│       └── storeService.test.ts    修改：快照 round-trip 用例
├── preload/index.ts                修改：api.store / api.media / api.app
└── renderer/src/
    ├── player/playerCore.ts        新增：播放内核（TDD）
    ├── player/__tests__/playerCore.test.ts  新增
    ├── store/appStore.ts           修改：actions + hydrate + 持久化调度
    ├── hooks/useAutoHide.ts        新增：鼠标静止 2.5s 隐藏
    ├── hooks/useShortcuts.ts       新增：全局快捷键
    ├── components/PlayerView.tsx   新增：视频区 + 标题 + 右上按钮 + 错误浮层
    ├── components/ControlsBar.tsx  新增：控制列 + 进度条 + 记忆标记
    ├── components/UrlInputOverlay.tsx 新增：打开网络流输入
    ├── App.tsx                     修改：接入 PlayerView
    └── styles.css                  修改：沉浸式控件样式
tests/setup.ts                      新增：jsdom HTMLMediaElement 方法补齐
```

---

## Task 1: 依赖与测试环境

**Files:**
- Modify: `jest.config.js`
- Create: `tests/setup.ts`

- [ ] **Step 1: 安装依赖**

```bash
npm install hls.js flv.js
npm install -D jsdom @types/flv.js
```

预期：hls.js（自带类型）、flv.js 进入 dependencies。

- [ ] **Step 2: 更新 jest.config.js**（node → jsdom，lib 加 DOM）

```js
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
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
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          types: ['node', 'jest'],
          skipLibCheck: true
        }
      }
    ]
  },
  moduleFileExtensions: ['ts', 'js', 'json']
}
```

- [ ] **Step 3: 创建 tests/setup.ts**（jsdom 未实现 HTMLMediaElement 的播放方法，补齐为 jest.fn）

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
```

- [ ] **Step 4: 验证原有测试仍绿 + 提交**

```bash
npm test
npm run typecheck
```

预期：17 个用例全绿。

```bash
git add -A
git commit -m "chore: P2 依赖（hls.js/flv.js）与 jsdom 测试环境"
```

---

## Task 2: 共享源工具（TDD）

**Files:**
- Test: `src/main/__tests__/source.test.ts`
- Create: `src/shared/source.ts`

- [ ] **Step 1: 写失败测试 src/main/__tests__/source.test.ts**

```ts
import {
  extensionOf,
  guessSourceType,
  isFileSource,
  titleFromPath,
  toFileUrl,
  uid
} from '../../shared/source'

describe('source 工具', () => {
  it('extensionOf 提取小写扩展名', () => {
    expect(extensionOf('C:\\v\\a.MP4')).toBe('mp4')
    expect(extensionOf('D:/x/y.webm')).toBe('webm')
    expect(extensionOf('https://x.com/live.m3u8?token=1')).toBe('m3u8')
    expect(extensionOf('noext')).toBe('')
  })

  it('isFileSource 识别 Windows 路径与 file:// 前缀', () => {
    expect(isFileSource('C:\\v\\a.mp4')).toBe(true)
    expect(isFileSource('D:/x/a.mp4')).toBe(true)
    expect(isFileSource('file:///C:/x/a.mp4')).toBe(true)
    expect(isFileSource('https://x.com/a.mp4')).toBe(false)
  })

  it('guessSourceType 按 m3u8/flv/本地/直链 判定', () => {
    expect(guessSourceType('https://x.com/live.m3u8')).toBe('m3u8')
    expect(guessSourceType('https://x.com/s.m3u8?token=1')).toBe('m3u8')
    expect(guessSourceType('C:\\v\\s.m3u8')).toBe('m3u8')
    expect(guessSourceType('https://x.com/l.flv')).toBe('flv')
    expect(guessSourceType('C:\\v\\a.mp4')).toBe('file')
    expect(guessSourceType('D:/x/a.webm')).toBe('file')
    expect(guessSourceType('https://x.com/v.mp4')).toBe('url')
  })

  it('titleFromPath 取文件名去扩展名', () => {
    expect(titleFromPath('C:\\v\\My Video.mp4')).toBe('My Video')
    expect(titleFromPath('D:/x/a.b.c.webm')).toBe('a.b.c')
  })

  it('toFileUrl 转换 Windows 路径并保留 file:// 原样', () => {
    expect(toFileUrl('C:\\v\\a.mp4')).toBe('file:///C:/v/a.mp4')
    expect(toFileUrl('D:/x/a.mp4')).toBe('file:///D:/x/a.mp4')
    expect(toFileUrl('file:///C:/x/a.mp4')).toBe('file:///C:/x/a.mp4')
  })

  it('uid 生成唯一值', () => {
    expect(uid()).not.toBe(uid())
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx jest src/main/__tests__/source.test.ts
```

预期：FAIL（Cannot find module '../../shared/source'）。

- [ ] **Step 3: 实现 src/shared/source.ts**

```ts
import type { MediaItem, SourceType } from './types'

export function extensionOf(value: string): string {
  const match = /\.([a-z0-9]+)(?:\?|$)/i.exec(value)
  return match ? match[1].toLowerCase() : ''
}

export function isFileSource(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('file://')
}

export function guessSourceType(value: string): SourceType {
  const ext = extensionOf(value)
  if (ext === 'm3u8' || /\.m3u8($|\?)/i.test(value)) return 'm3u8'
  if (ext === 'flv' || /\.flv($|\?)/i.test(value)) return 'flv'
  if (isFileSource(value)) return 'file'
  if (/^https?:\/\//i.test(value)) return 'url'
  return 'file'
}

export function titleFromPath(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

export function toFileUrl(path: string): string {
  if (path.startsWith('file://')) return path
  const normalized = path.replace(/\\/g, '/')
  return 'file:///' + normalized
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function mediaItemFromPath(path: string): MediaItem {
  return { id: uid(), title: titleFromPath(path), sourceType: guessSourceType(path), value: path }
}

export function mediaItemFromUrl(url: string): MediaItem {
  return { id: uid(), title: url, sourceType: guessSourceType(url), value: url }
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx jest src/main/__tests__/source.test.ts
```

预期：PASS，6 个用例。

- [ ] **Step 5: 提交**

```bash
git add src/shared/source.ts src/main/__tests__/source.test.ts
git commit -m "feat: 共享源工具（类型判定/file URL/标题提取）"
```

---

## Task 3: 播放内核 PlayerCore（TDD）

**Files:**
- Test: `src/renderer/src/player/__tests__/playerCore.test.ts`
- Create: `src/renderer/src/player/playerCore.ts`

- [ ] **Step 1: 写失败测试 src/renderer/src/player/__tests__/playerCore.test.ts**

（注意：jest 30 中 `mock.instances` 对返回对象的 mockImplementation 不再记录，故 Hls mock 通过外部 `__instances` 数组收集实例）

```ts
import { PlayerCore } from '../playerCore'
import type { MediaItem } from '../../../../shared/types'

jest.mock('hls.js', () => {
  const instances: Array<Record<string, jest.Mock>> = []
  const HlsMock = jest.fn().mockImplementation(() => {
    const inst = {
      attachMedia: jest.fn(),
      loadSource: jest.fn(),
      destroy: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      config: {}
    }
    instances.push(inst)
    return inst
  })
  HlsMock.isSupported = jest.fn(() => true)
  HlsMock.Events = { ERROR: 'hlsError' }
  HlsMock.__instances = instances
  return { __esModule: true, default: HlsMock }
})

jest.mock('flv.js', () => ({
  __esModule: true,
  default: {
    isSupported: jest.fn(() => true),
    createPlayer: jest.fn(() => ({
      attachMediaElement: jest.fn(),
      load: jest.fn(),
      play: jest.fn(),
      destroy: jest.fn(),
      on: jest.fn()
    }))
  }
}))

import Hls from 'hls.js'
import flvjs from 'flv.js'

function makeItem(partial: Partial<MediaItem> = {}): MediaItem {
  return { id: 'm1', title: '测试', sourceType: 'file', value: 'C:\\v\\a.mp4', ...partial }
}

function createVideo(): HTMLVideoElement {
  const video = document.createElement('video')
  Object.defineProperty(video, 'videoWidth', { configurable: true, get: () => 1280 })
  Object.defineProperty(video, 'videoHeight', { configurable: true, get: () => 720 })
  Object.defineProperty(video, 'duration', { configurable: true, get: () => 100 })
  Object.defineProperty(video, 'paused', { configurable: true, get: () => false })
  return video
}

function fire(video: HTMLVideoElement, event: string): void {
  video.dispatchEvent(new Event(event))
}

describe('PlayerCore', () => {
  let video: HTMLVideoElement

  beforeEach(() => {
    video = createVideo()
    jest.clearAllMocks()
  })

  it('m3u8 源创建 Hls 实例并 attachMedia/loadSource', () => {
    const core = new PlayerCore(video)
    core.load(makeItem({ sourceType: 'm3u8', value: 'https://x.com/live.m3u8' }))
    expect(Hls).toHaveBeenCalledTimes(1)
    const hls = (Hls as unknown as jest.Mock).mock.instances[0]
    expect(hls.attachMedia).toHaveBeenCalledWith(video)
    expect(hls.loadSource).toHaveBeenCalledWith('https://x.com/live.m3u8')
    core.destroy()
  })

  it('flv 源创建 flv player 并 attachMediaElement/load/play', () => {
    const core = new PlayerCore(video)
    core.load(makeItem({ sourceType: 'flv', value: 'https://x.com/live.flv' }))
    expect(flvjs.createPlayer).toHaveBeenCalledWith({ type: 'flv', url: 'https://x.com/live.flv', isLive: false })
    const player = (flvjs.createPlayer as unknown as jest.Mock).mock.results[0].value
    expect(player.attachMediaElement).toHaveBeenCalledWith(video)
    expect(player.load).toHaveBeenCalled()
    expect(player.play).toHaveBeenCalled()
    core.destroy()
  })

  it('本地文件源直接设置 file:// src，不创建任何引擎', () => {
    const core = new PlayerCore(video)
    core.load(makeItem({ sourceType: 'file', value: 'C:\\v\\a.mp4' }))
    expect(video.src).toBe('file:///C:/v/a.mp4')
    expect(Hls).not.toHaveBeenCalled()
    expect(flvjs.createPlayer).not.toHaveBeenCalled()
    core.destroy()
  })

  it('http 直链直接设置 src', () => {
    const core = new PlayerCore(video)
    core.load(makeItem({ sourceType: 'url', value: 'https://x.com/v.mp4' }))
    expect(video.src).toBe('https://x.com/v.mp4')
    core.destroy()
  })

  it('重复 load 会销毁上一个引擎（防内存泄漏）', () => {
    const core = new PlayerCore(video)
    core.load(makeItem({ sourceType: 'm3u8', value: 'https://x.com/a.m3u8' }))
    const first = (Hls as unknown as jest.Mock).mock.instances[0]
    core.load(makeItem({ sourceType: 'm3u8', value: 'https://x.com/b.m3u8' }))
    expect(first.destroy).toHaveBeenCalledTimes(1)
    const second = (Hls as unknown as jest.Mock).mock.instances[1]
    expect(second).not.toBe(first)
    core.destroy()
  })

  it('destroy 释放引擎、清空 src 并移除监听', () => {
    const core = new PlayerCore(video)
    core.load(makeItem({ sourceType: 'm3u8', value: 'https://x.com/a.m3u8' }))
    const hls = (Hls as unknown as jest.Mock).mock.instances[0]
    core.destroy()
    expect(hls.destroy).toHaveBeenCalledTimes(1)
    expect(video.hasAttribute('src')).toBe(false)
  })

  it('hls 致命错误触发 onError 并销毁引擎', () => {
    const onError = jest.fn()
    const core = new PlayerCore(video, { onError })
    core.load(makeItem({ sourceType: 'm3u8', value: 'https://x.com/a.m3u8' }))
    const hls = (Hls as unknown as jest.Mock).mock.instances[0]
    const errorHandler = hls.on.mock.calls.find(([evt]: [string]) => evt === 'hlsError')[1]
    errorHandler('hlsError', { fatal: true, details: 'networkError' })
    expect(onError).toHaveBeenCalledWith('fatal', 'networkError')
    expect(hls.destroy).toHaveBeenCalled()
    core.destroy()
  })

  it('video 原生 error 事件映射为错误回调', () => {
    const onError = jest.fn()
    const core = new PlayerCore(video, { onError })
    fire(video, 'error')
    expect(onError).toHaveBeenCalledWith('network', 'video error 0')
    core.destroy()
  })

  it('timeupdate 事件转发当前时间', () => {
    const onTimeUpdate = jest.fn()
    const core = new PlayerCore(video, { onTimeUpdate })
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 42 })
    fire(video, 'timeupdate')
    expect(onTimeUpdate).toHaveBeenCalledWith(42)
    core.destroy()
  })

  it('控制方法透传 video：play/pause/togglePlay/seek/volume/rate', () => {
    const core = new PlayerCore(video)
    core.play()
    expect(video.play).toHaveBeenCalled()
    core.pause()
    expect(video.pause).toHaveBeenCalled()
    core.togglePlay()
    core.seek(30)
    core.setVolume(0.5)
    expect(video.volume).toBe(0.5)
    core.setMuted(true)
    expect(video.muted).toBe(true)
    core.setRate(1.5)
    expect(video.playbackRate).toBe(1.5)
    core.destroy()
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx jest src/renderer/src/player/__tests__/playerCore.test.ts
```

预期：FAIL（Cannot find module '../playerCore'）。

- [ ] **Step 3: 实现 src/renderer/src/player/playerCore.ts**

```ts
import Hls from 'hls.js'
import flvjs from 'flv.js'
import type { MediaItem } from '../../../shared/types'
import { toFileUrl } from '../../../shared/source'

export type PlayerErrorKind = 'network' | 'unsupported' | 'fatal'

export interface PlayerCoreEvents {
  onTimeUpdate?: (currentTime: number) => void
  onDuration?: (duration: number) => void
  onPlaying?: () => void
  onPaused?: () => void
  onEnded?: () => void
  onError?: (kind: PlayerErrorKind, message: string) => void
  onLoadedMetadata?: (videoWidth: number, videoHeight: number, duration: number) => void
}

export class PlayerCore {
  private hls: Hls | null = null
  private flv: flvjs.Player | null = null

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly events: PlayerCoreEvents = {}
  ) {
    this.video.addEventListener('timeupdate', this.handleTimeUpdate)
    this.video.addEventListener('durationchange', this.handleDurationChange)
    this.video.addEventListener('play', this.handlePlay)
    this.video.addEventListener('pause', this.handlePause)
    this.video.addEventListener('ended', this.handleEnded)
    this.video.addEventListener('error', this.handleVideoError)
    this.video.addEventListener('loadedmetadata', this.handleLoadedMetadata)
  }

  load(item: MediaItem): void {
    this.disposeEngine()
    if (item.sourceType === 'm3u8' && Hls.isSupported()) {
      this.loadHls(item.value)
    } else if (item.sourceType === 'flv' && flvjs.isSupported()) {
      this.loadFlv(item.value)
    } else {
      this.video.src = item.sourceType === 'file' ? toFileUrl(item.value) : item.value
      this.video.load()
    }
  }

  private loadHls(url: string): void {
    const hls = new Hls()
    this.hls = hls
    hls.on(Hls.Events.ERROR, (_event, data) => {
      const fatal = Boolean(data.fatal)
      if (fatal) this.disposeEngine()
      this.events.onError?.(fatal ? 'fatal' : 'network', String(data.details ?? 'hls error'))
    })
    hls.loadSource(url)
    hls.attachMedia(this.video)
  }

  private loadFlv(url: string): void {
    const flv = flvjs.createPlayer({ type: 'flv', url, isLive: false })
    this.flv = flv
    flv.on(flvjs.Events.ERROR, (_type, detail) => {
      this.events.onError?.('fatal', String(detail ?? 'flv error'))
    })
    flv.attachMediaElement(this.video)
    flv.load()
    flv.play()
  }

  play(): void {
    this.video.play()?.catch(() => {})
  }

  pause(): void {
    this.video.pause()
  }

  togglePlay(): void {
    if (this.video.paused) this.play()
    else this.pause()
  }

  seek(time: number): void {
    this.video.currentTime = time
  }

  setVolume(volume: number): void {
    this.video.volume = Math.min(1, Math.max(0, volume))
  }

  setMuted(muted: boolean): void {
    this.video.muted = muted
  }

  setRate(rate: number): void {
    this.video.playbackRate = rate
  }

  getDuration(): number {
    return Number.isFinite(this.video.duration) ? this.video.duration : 0
  }

  destroy(): void {
    this.disposeEngine()
    this.video.removeEventListener('timeupdate', this.handleTimeUpdate)
    this.video.removeEventListener('durationchange', this.handleDurationChange)
    this.video.removeEventListener('play', this.handlePlay)
    this.video.removeEventListener('pause', this.handlePause)
    this.video.removeEventListener('ended', this.handleEnded)
    this.video.removeEventListener('error', this.handleVideoError)
    this.video.removeEventListener('loadedmetadata', this.handleLoadedMetadata)
    this.video.removeAttribute('src')
    this.video.load()
  }

  private disposeEngine(): void {
    if (this.hls) {
      this.hls.destroy()
      this.hls = null
    }
    if (this.flv) {
      this.flv.destroy()
      this.flv = null
    }
  }

  private handleTimeUpdate = (): void => {
    this.events.onTimeUpdate?.(this.video.currentTime)
  }

  private handleDurationChange = (): void => {
    this.events.onDuration?.(this.getDuration())
  }

  private handlePlay = (): void => {
    this.events.onPlaying?.()
  }

  private handlePause = (): void => {
    this.events.onPaused?.()
  }

  private handleEnded = (): void => {
    this.events.onEnded?.()
  }

  private handleLoadedMetadata = (): void => {
    this.events.onLoadedMetadata?.(this.video.videoWidth, this.video.videoHeight, this.getDuration())
  }

  private handleVideoError = (): void => {
    const code = this.video.error?.code ?? 0
    this.events.onError?.(code === 4 ? 'unsupported' : 'network', `video error ${code}`)
  }
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx jest src/renderer/src/player/__tests__/playerCore.test.ts
```

预期：PASS，10 个用例。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/player
git commit -m "feat: 播放内核 PlayerCore（hls/flv/原生多引擎+资源释放）"
```

---

## Task 4: 主进程扩展（扫描/快照/关闭流程）

**Files:**
- Test: `src/main/__tests__/mediaService.test.ts`（新增）
- Modify: `src/main/__tests__/storeService.test.ts`
- Create: `src/main/mediaService.ts`
- Modify: `src/main/storeService.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: 写失败测试 src/main/__tests__/mediaService.test.ts**

```ts
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanMediaFolder } from '../mediaService'

describe('scanMediaFolder', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vh-test-'))
    writeFileSync(join(dir, 'a.mp4'), '')
    writeFileSync(join(dir, 'b.WEBM'), '')
    writeFileSync(join(dir, 'live.m3u8'), '')
    writeFileSync(join(dir, 'c.flv'), '')
    writeFileSync(join(dir, 'readme.txt'), '')
    mkdirSync(join(dir, 'subdir'))
  })

  it('只返回受支持扩展名的媒体文件，忽略目录与其他文件', async () => {
    const items = await scanMediaFolder(dir)
    const values = items.map((i) => i.value)
    expect(values).toContain(join(dir, 'a.mp4'))
    expect(values).toContain(join(dir, 'b.WEBM'))
    expect(values).toContain(join(dir, 'live.m3u8'))
    expect(values).toContain(join(dir, 'c.flv'))
    expect(values).not.toContain(join(dir, 'readme.txt'))
    expect(values).not.toContain(join(dir, 'subdir'))
  })

  it('生成带标题与正确 sourceType 的 MediaItem', async () => {
    const items = await scanMediaFolder(dir)
    const a = items.find((i) => i.value.endsWith('a.mp4'))
    expect(a?.title).toBe('a')
    expect(a?.sourceType).toBe('file')
    const live = items.find((i) => i.value.endsWith('live.m3u8'))
    expect(live?.sourceType).toBe('m3u8')
  })

  it('目录不存在返回空数组', async () => {
    await expect(scanMediaFolder(join(dir, 'not-exist'))).resolves.toEqual([])
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx jest src/main/__tests__/mediaService.test.ts
```

预期：FAIL（Cannot find module '../mediaService'）。

- [ ] **Step 3: 实现 src/main/mediaService.ts**

```ts
import { readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { MediaItem } from '../shared/types'
import { guessSourceType, titleFromPath, uid } from '../shared/source'

const SUPPORTED_EXTENSIONS = new Set(['.mp4', '.webm', '.ogv', '.mov', '.mkv', '.m3u8', '.flv'])

export async function scanMediaFolder(folder: string): Promise<MediaItem[]> {
  try {
    const entries = await readdir(folder, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && SUPPORTED_EXTENSIONS.has(extname(e.name).toLowerCase()))
      .map((e) => {
        const path = join(folder, e.name)
        return { id: uid(), title: titleFromPath(path), sourceType: guessSourceType(path), value: path }
      })
  } catch {
    return []
  }
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx jest src/main/__tests__/mediaService.test.ts
```

预期：PASS，3 个用例。

- [ ] **Step 5: storeService 快照——先加测试（追加到 storeService.test.ts）**

```ts
  it('saveAll/getAll 快照 round-trip', () => {
    const { service } = createService()
    const snapshot = {
      playlists: [
        { id: 'p1', name: '列表', items: [{ id: 'm1', title: '一', sourceType: 'file' as const, value: 'C:\\a.mp4' }], createdAt: 1 }
      ],
      favorites: { id: 'favorites', name: '收藏', items: [{ id: 'f1', title: '爱', sourceType: 'url' as const, value: 'https://x.com/v.mp4' }], createdAt: 2 },
      settings: { downloadDir: 'D:/d', autoResume: false },
      instances: [0, 1, 2, 3].map((id) => ({ id, playlistId: null, currentIndex: 0, playMode: 'order' as const, isPlaying: false, volume: 1, rate: 1, scaleMode: 'contain' as const }))
    }
    service.saveAll(snapshot)
    expect(service.getAll()).toEqual(snapshot)
  })
```

运行确认失败（saveAll/getAll 不存在）→ 实现：

```ts
// storeService.ts 顶部类型区追加
export interface StoreSnapshot {
  playlists: Playlist[]
  favorites: Playlist
  settings: Settings
  instances: PlayerInstance[]
}

// StoreService 类内追加
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
```

运行确认通过。

- [ ] **Step 6: types.ts 扩展**（在 StoreSettings 附近追加 StoreSnapshot；IPC 常量与 IpcApi 扩展）

```ts
// 追加到 types.ts 末尾的 IpcApi 前
export interface StoreSnapshot {
  playlists: Playlist[]
  favorites: Playlist
  settings: Settings
  instances: PlayerInstance[]
}

// IPC 常量追加
  storeGetAll: 'store:get-all',
  storeSaveAll: 'store:save-all',
  mediaScanFolder: 'media:scan-folder',
  appClosing: 'app:closing',
  appReadyToClose: 'app:ready-to-close'

// IpcApi 追加
  store: {
    getAll(): Promise<StoreSnapshot>
    saveAll(snapshot: StoreSnapshot): Promise<void>
  }
  media: {
    scanFolder(folder: string): Promise<MediaItem[]>
  }
  app: {
    onClosing(callback: () => void): () => void
    readyToClose(): Promise<void>
  }
```

- [ ] **Step 7: ipc.ts 扩展**（storeService 实例在 registerIpc 内创建）

```ts
import { BrowserWindow, ipcMain } from 'electron'
import { IPC, type StoreSnapshot } from '../shared/types'
import { WindowManager } from './windowManager'
import { DialogService } from './dialogService'
import { createElectronStoreBackend, StoreService } from './storeService'
import { scanMediaFolder } from './mediaService'

export function registerIpc(win: BrowserWindow): void {
  const windowManager = new WindowManager({ ...不变... })
  const dialog = new DialogService(win)
  const store = new StoreService(createElectronStoreBackend())

  ipcMain.handle(IPC.storeGetAll, () => store.getAll())
  ipcMain.handle(IPC.storeSaveAll, (_event, snapshot: StoreSnapshot) => {
    store.saveAll(snapshot)
  })
  ipcMain.handle(IPC.mediaScanFolder, (_event, folder: string) => scanMediaFolder(folder))
  ipcMain.handle(IPC.appReadyToClose, () => {
    win.destroy()
  })

  // ...原有窗口/对话框 handler 保持不变
}
```

- [ ] **Step 8: index.ts 关闭流程**（拦截 close → 广播 → 1.5s 超时兜底销毁）

```ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { IPC } from '../shared/types'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({ ...不变... })

  win.once('ready-to-show', () => win.show())

  // 关闭前通知渲染进程持久化，1.5s 超时兜底
  win.on('close', (event) => {
    event.preventDefault()
    win.webContents.send(IPC.appClosing)
    setTimeout(() => {
      if (!win.isDestroyed()) win.destroy()
    }, 1500)
  })

  // ...setWindowOpenHandler / registerIpc / 加载逻辑不变
}
```

- [ ] **Step 9: preload 扩展**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type IpcApi, type StoreSnapshot } from '../shared/types'

const api: IpcApi = {
  window: { ...不变... },
  dialog: { ...不变... },
  store: {
    getAll: () => ipcRenderer.invoke(IPC.storeGetAll),
    saveAll: (snapshot: StoreSnapshot) => ipcRenderer.invoke(IPC.storeSaveAll, snapshot)
  },
  media: {
    scanFolder: (folder: string) => ipcRenderer.invoke(IPC.mediaScanFolder, folder)
  },
  app: {
    onClosing: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on(IPC.appClosing, listener)
      return () => {
        ipcRenderer.removeListener(IPC.appClosing, listener)
      }
    },
    readyToClose: () => ipcRenderer.invoke(IPC.appReadyToClose)
  }
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 10: 验证 + 提交**

```bash
npm run typecheck
npm test
```

预期：typecheck 无报错；测试全绿（20+ 用例）。

```bash
git add -A
git commit -m "feat: 主进程媒体扫描/存储快照/关闭持久化流程"
```

---

## Task 5: 渲染 store 扩展（actions + 持久化调度）

**Files:**
- Modify: `src/renderer/src/store/appStore.ts`

- [ ] **Step 1: 重写 appStore.ts**（注入快照/实例操作/持久化调度/播放模式切换）

```ts
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
```

- [ ] **Step 2: 验证 + 提交**

```bash
npm run typecheck
```

```bash
git add src/renderer/src/store/appStore.ts
git commit -m "feat: 渲染 store actions 与节流持久化调度"
```

---

## Task 6: PlayerView 集成

**Files:**
- Create: `src/renderer/src/components/PlayerView.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`（控件样式）

- [ ] **Step 1: 创建 PlayerView.tsx**（视频元素 + PlayerCore 生命周期 + 错误浮层 + 右上按钮组）

```tsx
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { persistNow, schedulePersist } from '../store/appStore'
import { PlayerCore, type PlayerErrorKind } from '../player/playerCore'
import { mediaItemFromPath, mediaItemFromUrl } from '../../../shared/source'
import ControlsBar from './ControlsBar'
import UrlInputOverlay from './UrlInputOverlay'

interface PlayerViewProps {
  instanceId: number
}

export default function PlayerView({ instanceId }: PlayerViewProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const coreRef = useRef<PlayerCore | null>(null)
  const [error, setError] = useState<{ kind: PlayerErrorKind; message: string } | null>(null)
  const [showUrlInput, setShowUrlInput] = useState(false)

  const instance = useAppStore((s) => s.instances[instanceId])
  const playlists = useAppStore((s) => s.playlists)
  const settings = useAppStore((s) => s.settings)

  const playlist = playlists.find((p) => p.id === instance.playlistId) ?? null
  const currentItem = playlist?.items[instance.currentIndex] ?? null

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const core = new PlayerCore(video, {
      onPlaying: () => useAppStore.getState().updateInstance(instanceId, { isPlaying: true }),
      onPaused: () => useAppStore.getState().updateInstance(instanceId, { isPlaying: false }),
      onEnded: () => useAppStore.getState().nextInInstance(instanceId),
      onError: (kind, message) => setError({ kind, message }),
      onTimeUpdate: () => {
        const item = currentItemRef.current
        const ins = useAppStore.getState().instances[instanceId]
        if (item && ins.playlistId) {
          const now = video.currentTime
          if (now - lastSaveRef.current > 10) {
            lastSaveRef.current = now
            useAppStore.getState().updateItemLastPosition(ins.playlistId, item.id, now)
            schedulePersist()
          }
        }
      }
    })
    coreRef.current = core
    return () => {
      core.destroy()
      coreRef.current = null
    }
  }, [instanceId])

  const currentItemRef = useRef(currentItem)
  currentItemRef.current = currentItem
  const lastSaveRef = useRef(0)

  useEffect(() => {
    const core = coreRef.current
    if (!core || !currentItem) return
    setError(null)
    core.load(currentItem)
    core.setVolume(instance.volume)
    core.setRate(instance.rate)
    if (instance.isPlaying) core.play()
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
      if (currentItem.lastPosition && currentItem.lastPosition < video.duration - 3) {
        video.currentTime = currentItem.lastPosition
      }
      video.removeEventListener('loadedmetadata', onMeta)
    }
    video.addEventListener('loadedmetadata', onMeta)
    return () => video.removeEventListener('loadedmetadata', onMeta)
  }, [currentItem?.id])

  const handleOpenFiles = async (): Promise<void> => {
    const paths = await window.api.dialog.openFile()
    if (!paths || paths.length === 0) return
    const items = paths.map(mediaItemFromPath)
    const playlist = {
      id: crypto.randomUUID(),
      name: items[0].title,
      items,
      createdAt: Date.now()
    }
    useAppStore.getState().addPlaylist(playlist)
    useAppStore.getState().updateInstance(instanceId, { playlistId: playlist.id, currentIndex: 0, isPlaying: true })
  }

  const handleOpenFolder = async (): Promise<void> => {
    const folder = await window.api.dialog.openFolder()
    if (!folder) return
    const items = await window.api.media.scanFolder(folder)
    if (items.length === 0) return
    const playlist = {
      id: crypto.randomUUID(),
      name: items[0].title,
      items,
      createdAt: Date.now()
    }
    useAppStore.getState().addPlaylist(playlist)
    useAppStore.getState().updateInstance(instanceId, { playlistId: playlist.id, currentIndex: 0, isPlaying: true })
  }

  const handleOpenUrl = (url: string): void => {
    const item = mediaItemFromUrl(url.trim())
    const playlist = { id: crypto.randomUUID(), name: item.title, items: [item], createdAt: Date.now() }
    useAppStore.getState().addPlaylist(playlist)
    useAppStore.getState().updateInstance(instanceId, { playlistId: playlist.id, currentIndex: 0, isPlaying: true })
  }

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
    core.load(item)
    core.play()
  }

  return (
    <div className="player-view">
      <video ref={videoRef} className="player-video" playsInline />
      <div className="player-title">{currentItem?.title ?? 'VHplayer'}</div>
      <div className="player-actions">
        <button title="打开文件" onClick={() => void handleOpenFiles()}>打开</button>
        <button title="打开文件夹" onClick={() => void handleOpenFolder()}>文件夹</button>
        <button title="打开网络流" onClick={() => setShowUrlInput(true)}>网络流</button>
        <button title="置顶小窗" onClick={() => void handleToggleMini()}>置顶</button>
        <button title="全屏" onClick={() => void window.api.window.toggleFullscreen()}>全屏</button>
      </div>
      {error && (
        <div className="error-overlay">
          <div className="error-text">播放失败（{error.kind === 'unsupported' ? '格式不支持' : error.kind === 'network' ? '网络错误' : '致命错误'}）</div>
          <div className="error-actions">
            <button onClick={retry}>重试</button>
            <button onClick={() => useAppStore.getState().nextInInstance(instanceId)}>下一项</button>
          </div>
        </div>
      )}
      <ControlsBar instanceId={instanceId} />
      {showUrlInput && <UrlInputOverlay onCancel={() => setShowUrlInput(false)} onConfirm={handleOpenUrl} />}
    </div>
  )
}
```

- [ ] **Step 2: 更新 App.tsx**（渲染 PlayerView）

```tsx
import PlayerView from './components/PlayerView'
import { useAppStore } from './store/appStore'
import { useEffect } from 'react'

export default function App(): React.JSX.Element {
  const activeInstance = useAppStore((s) => s.activeInstance)
  const hydrate = useAppStore((s) => s.hydrate)

  useEffect(() => {
    window.api.store.getAll().then((snapshot) => hydrate(snapshot))
  }, [hydrate])

  useEffect(() => {
    return window.api.app.onClosing(() => {
      void persistNow().finally(() => window.api.app.readyToClose())
    })
  }, [])

  return (
    <div className="app">
      <PlayerView instanceId={activeInstance} />
    </div>
  )
}
```

（P2 移除顶部标题条——标题移入播放区左上，符合沉浸式 spec；拖拽区改为标题条渲染在播放区上方覆盖层，`-webkit-app-region: drag`。见 Step 4 样式。）

- [ ] **Step 3: 验证 build**

```bash
npm run typecheck
npm run build
```

预期：通过（ControlsBar/UrlInputOverlay 尚不存在，先建 Task 7/8 的占位导出或顺延 build 验证——**实施顺序调整**：先完成 Task 7/8 再统一 build 验证）。

- [ ] **Step 4: 提交**（在 Task 7/8 完成后与样式一起提交）

---

## Task 7: ControlsBar + useAutoHide

**Files:**
- Create: `src/renderer/src/hooks/useAutoHide.ts`
- Create: `src/renderer/src/components/ControlsBar.tsx`

- [ ] **Step 1: 创建 useAutoHide.ts**

```ts
import { useEffect, useRef, useState } from 'react'

export interface AutoHideHandlers {
  visible: boolean
  onMouseMove: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export function useAutoHide(delayMs = 2500): AutoHideHandlers {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleHide = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), delayMs)
  }

  const show = (): void => {
    setVisible(true)
    scheduleHide()
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return {
    visible,
    onMouseMove: show,
    onMouseEnter: show,
    onMouseLeave: () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setVisible(false)
    }
  }
}
```

- [ ] **Step 2: 创建 ControlsBar.tsx**（进度条 + 记忆标记 + 播放控制 + 音量 + 倍速 + 模式）

```tsx
import { useAutoHide } from '../hooks/useAutoHide'
import { useAppStore } from '../store/appStore'
import { PlayerCore } from '../player/playerCore'
import { useEffect, useRef, useState } from 'react'

interface ControlsBarProps {
  instanceId: number
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

const MODE_LABEL: Record<string, string> = { order: '顺序', loop: '循环', random: '随机' }

export default function ControlsBar({ instanceId }: ControlsBarProps): React.JSX.Element {
  const instance = useAppStore((s) => s.instances[instanceId])
  const playlists = useAppStore((s) => s.playlists)
  const { visible, onMouseMove, onMouseEnter, onMouseLeave } = useAutoHide()

  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)

  const playlist = playlists.find((p) => p.id === instance.playlistId) ?? null
  const currentItem = playlist?.items[instance.currentIndex] ?? null

  useEffect(() => {
    const root = document.querySelector('.player-view')
    const video = root?.querySelector('video')
    videoRef.current = video as HTMLVideoElement | null
  }, [instanceId])

  const onVideoUpdate = (): void => {
    const video = videoRef.current
    if (!video) return
    setCurrentTime(video.currentTime)
    setDuration(video.duration)
  }

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
  const percent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      className={`controls-bar ${visible ? 'visible' : ''}`}
      onMouseMove={onMouseMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
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
        <button title="上一集" onClick={() => useAppStore.getState().prevInInstance(instanceId)}>⏮</button>
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
        <button title="下一集" onClick={() => useAppStore.getState().nextInInstance(instanceId)}>⏭</button>
        <button title="倍速" onClick={() => useAppStore.getState().cycleRate(instanceId)}>{instance.rate}x</button>
        <button title="播放模式" onClick={() => useAppStore.getState().cyclePlayMode(instanceId)}>
          {MODE_LABEL[instance.playMode] ?? instance.playMode}
        </button>
        <div className="volume-wrap">
          <button title={muted ? '取消静音' : '静音'} onClick={toggleMuted}>{muted ? '🔇' : '🔊'}</button>
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

- [ ] **Step 3: 验证 typecheck 并提交**

```bash
npm run typecheck
```

```bash
git add src/renderer/src/hooks/useAutoHide.ts src/renderer/src/components/ControlsBar.tsx
git commit -m "feat: 控制列（2.5s 鼠标静止隐藏/进度/记忆标记）"
```

---

## Task 8: 快捷键 + 网络流输入浮层 + 沉浸式样式

**Files:**
- Create: `src/renderer/src/hooks/useShortcuts.ts`
- Create: `src/renderer/src/components/UrlInputOverlay.tsx`
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: 创建 useShortcuts.ts**（全局按键路由到活动实例；输入态忽略）

```ts
import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
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
        case 'Escape':
          void window.api.window.getState().then((s) => {
            if (s.mode === 'fullscreen') void window.api.window.exitFullscreen()
            else if (s.mode === 'mini') void window.api.window.exitMini()
          })
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
```

- [ ] **Step 2: 创建 UrlInputOverlay.tsx**

```tsx
import { useEffect, useRef, useState } from 'react'

interface UrlInputOverlayProps {
  onCancel: () => void
  onConfirm: (url: string) => void
}

export default function UrlInputOverlay({ onCancel, onConfirm }: UrlInputOverlayProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = (): void => {
    if (value.trim()) onConfirm(value)
  }

  return (
    <div className="url-overlay" onClick={onCancel}>
      <div className="url-panel" onClick={(e) => e.stopPropagation()}>
        <div className="url-title">打开网络流（m3u8 / flv / 直链）</div>
        <input
          ref={inputRef}
          className="url-input"
          placeholder="https://example.com/live.m3u8"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="url-actions">
          <button onClick={onCancel}>取消</button>
          <button className="primary" onClick={submit} disabled={!value.trim()}>播放</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 更新 styles.css**（沉浸式：覆盖层拖拽条 + 视频铺满 + 控件样式）

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
  position: relative;
  height: 100%;
}

.player-view {
  position: relative;
  height: 100%;
  background: #000;
  -webkit-app-region: no-drag;
}

.player-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
  display: block;
}

.player-title {
  position: absolute;
  top: 36px;
  left: 16px;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}

.player-view:hover .player-title {
  opacity: 1;
}

.player-actions {
  position: absolute;
  top: 36px;
  right: 16px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s;
}

.player-view:hover .player-actions {
  opacity: 1;
}

.player-actions button,
.error-actions button,
.url-actions button {
  background: rgba(255, 255, 255, 0.12);
  border: none;
  color: #f5f5f5;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.player-actions button:hover,
.error-actions button:hover,
.url-actions button:hover {
  background: rgba(255, 255, 255, 0.24);
}

.controls-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 10px 16px 12px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.78), transparent);
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.2s, transform 0.2s;
  pointer-events: none;
}

.controls-bar.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.seek-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.seek-track {
  position: relative;
  flex: 1;
}

.seek-range {
  width: 100%;
  accent-color: #fe2c55;
  cursor: pointer;
  display: block;
}

.mark-dot {
  position: absolute;
  top: 50%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.time-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.75);
  white-space: nowrap;
}

.btn-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.btn-row button {
  background: none;
  border: none;
  color: #f5f5f5;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 4px;
  min-width: 34px;
}

.btn-row button:hover {
  color: #fe2c55;
}

.volume-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.volume-range {
  width: 90px;
  accent-color: #fe2c55;
}

.error-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.72);
}

.error-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
}

.error-actions {
  display: flex;
  gap: 8px;
}

.url-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  z-index: 10;
}

.url-panel {
  width: 380px;
  padding: 18px;
  border-radius: 10px;
  background: #1c1c1e;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.url-title {
  font-size: 14px;
  font-weight: 600;
}

.url-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: #2c2c2e;
  color: #f5f5f5;
  font-size: 13px;
  outline: none;
}

.url-input:focus {
  border-color: #fe2c55;
}

.url-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.url-actions button.primary {
  background: #fe2c55;
}
```

- [ ] **Step 4: App.tsx 接入 useShortcuts 与拖拽标题条**

```tsx
import { useEffect } from 'react'
import PlayerView from './components/PlayerView'
import { useAppStore } from './store/appStore'
import { persistNow } from './store/appStore'
import { useShortcuts } from './hooks/useShortcuts'

export default function App(): React.JSX.Element {
  const activeInstance = useAppStore((s) => s.activeInstance)
  const hydrate = useAppStore((s) => s.hydrate)
  useShortcuts()

  useEffect(() => {
    window.api.store.getAll().then((snapshot) => hydrate(snapshot))
  }, [hydrate])

  useEffect(() => {
    return window.api.app.onClosing(() => {
      void persistNow().finally(() => window.api.app.readyToClose())
    })
  }, [])

  return (
    <div className="app">
      <div className="app-titlebar" />
      <PlayerView instanceId={activeInstance} />
    </div>
  )
}
```

styles.css 追加拖拽条：

```css
.app-titlebar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  -webkit-app-region: drag;
  z-index: 5;
  pointer-events: none;
}
```

（拖拽条覆盖在最顶层但 pointer-events none 会失去拖拽能力——**修正**：不加 pointer-events:none，因为覆盖层只需要接收拖拽；但会挡住标题/按钮 hover。折中：标题/按钮区 top:36px 起始，在拖拽条（32px）之下，互不冲突。删除 pointer-events:none 即可正常拖拽。）

```css
.app-titlebar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  -webkit-app-region: drag;
  z-index: 5;
}
```

- [ ] **Step 5: 验证 + 提交**

```bash
npm run typecheck
npm run build
```

```bash
git add -A
git commit -m "feat: 单屏播放器 UI（PlayerView/控制列/快捷键/网络流输入）"
```

---

## Task 9: 记忆位置闭环 + 收尾验证

**Files:**
- Modify: 无新增（验证现有逻辑）

- [ ] **Step 1: 全量验证**

```bash
npm run typecheck
npm test
npm run build
```

预期：typecheck 无报错；全部测试通过（39 用例，含 2 个 React 集成测试）；build 成功。

- [ ] **Step 2: 手动验收（dev）**

```bash
npm run dev
```

验收清单（P2 范围）：
- [x] 「打开」选本地 mp4 → 自动播放，标题显示文件名，进度可拖动 seek
- [x] 「文件夹」打开含多个视频的目录 → 生成列表，⏮/⏭ 切换下一集
- [x] 「网络流」输入 m3u8 → hls.js 播放；输入错误地址 → 错误浮层，可「重试/下一项/关闭」
- [x] 鼠标移到播放区 → 控制列出现；静止 2.5s 自动隐藏；移动鼠标立即重现
- [x] 音量滑杆/静音/倍速循环（0.5→1→1.5→2→3）/模式（顺序→循环→随机）工作
- [x] 快捷键：空格 播放暂停、←/→ 5s、↑/↓ 音量、M 静音、F 全屏、P 置顶小窗、Esc 退出全屏/置顶
- [x] 播放中切换全屏/置顶/退出 → 窗口形态变化正常；切换视频不改变窗口大小
- [x] 播放一段后关闭 → 重开应用 → 自动续播到记忆位置；续播 seek 完成后记忆点消失；关闭/切视频时重新快照
- [x] 列表尾部「顺序」模式播完 → 停止；「循环」模式 → 回到第一集
- [x] 内存抽查：切换多个视频后内存不持续增长（引擎释放 + 懒加载生效）

- [ ] **Step 3: 最终提交**

```bash
git status --short
```

若无未提交内容则跳过；否则 `git add -A && git commit -m "chore: P2 收尾"`。

---

## 实施变更记录（与实际实现差异）

以下为实施过程中对计划的修正，均已通过测试与人工验收：

1. **本地媒体协议（Task 4 之后新增）**：`file://` 在 dev（http 页面）被 Chromium 拒绝（`Not allowed to load local resource`，error code 4）。最终实现：主进程注册自定义协议 `vh://`（`registerSchemesAsPrivileged` + `standard/secure/stream`），URL 形式 `vh://local/<盘符路径>`（盘符必须置于 path 位置，否则被 URL 解析吞掉冒号），协议处理器用 `fs.createReadStream` + 手动 `Range` 206 响应（`net.fetch` 不支持 file Range）。`toFileUrl` 输出 vh URL；dev/prod 行为一致。
2. **流引擎懒加载（Task 3 之后优化）**：hls.js/flv.js 改为动态 `import()`，本地文件播放不加载任何流引擎；构建产物主 chunk 2,182KB → 585KB，hls/flv 各自独立懒加载 chunk。
3. **控制栏 hover 修复**：`useAutoHide` 从 ControlsBar 自身移出，改挂在 PlayerView 根元素（不可见时 `pointer-events: none` 导致原方案永远无法触发 hover）。
4. **错误浮层增强**：显示错误细节 + 「关闭」按钮 + 点击背景关闭（此前浮层盖住全部按钮）。
5. **记忆续播最终设计（Task 9 重写）**：
   - 记忆点 = 「上次离开时的位置」，**播放中不漂移**
   - 离开快照：切换视频时保存旧项退出位置；关闭时 `flushPositions()` 快照全部实例
   - 周期兜底：每 15s `persistPositionOnly()` 直接把当前播放位置写盘（不更新 UI 记忆点），覆盖进程被强杀（关终端）导致 close 事件不触发的场景，最多丢 15s
   - 恢复：hydrate → loadedmetadata → `seek(lastPosition)`（下限 2s，接近结尾跳过）；**seeked 事件完成后才消费清除记忆点**
   - 曾踩坑：节流重置为 0 导致切视频首帧（0.013s）被立即保存；已改为恢复下限 2s + seeked 消费
6. **测试环境**：jest 升级 jsdom 环境 + `tests/setup.ts` 补齐 HTMLMediaElement 方法；jest.config 支持 `.tsx`（jsx: react-jsx）；新增 React 集成测试 `playerViewResume.test.tsx`（hydrate 时序 + seek 恢复 + 记忆点消费）。
7. **工具链修正**：typescript 从 7（Go 原生版，ts-jest 不兼容）降级到 5.9；jest 30 的 `mock.instances` 对返回对象的 mockImplementation 不生效，Hls mock 改用外部 `__instances` 数组；jest 28+ 需单独安装 `jest-environment-jsdom`；flv.js 自带类型（无需 @types/flv.js）；vite 固定 7.x + @vitejs/plugin-react 5.x（electron-vite 兼容）。

---

## 自我审查记录（Self-Review）

**Spec 覆盖：** P2 覆盖需求 1（沉浸式标题区）、2（切视频不动窗口）、3 部分（文件夹生成列表）、4（m3u8 播放）、8 部分（基础控制/倍速/快捷键/记忆位置）、9（resizable 系统原生 + 视频 contain 跟随）、13（鼠标静止隐藏控制列）。分屏（11）、收藏/来源管理（5/6/7）、右键菜单（12）、下载（10）、设置（14 菜单项）归 P3-P6。

**占位符扫描：** 无 TBD/TODO；所有代码完整。

**类型一致性：** `StoreSnapshot`/`IPC` 常量/IpcApi 在 Task 4 定义后，preload 与渲染进程直接引用；`PlayerCoreEvents` 回调签名在 PlayerView 使用处与实现一致；`AppStore` actions 名称（nextInInstance/updateItemLastPosition 等）在 PlayerView/ControlsBar/useShortcuts 中统一。

**已知取舍：** flushPositions/persistPositionOnly 通过 `document.querySelectorAll('.player-view video')` 按实例 id 取 video 元素（单实例正确；P4 分屏时改造为 ref 传递）。进度条用原生 range input，P3 后按需美化。
