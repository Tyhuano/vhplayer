# VHplayer P5：m3u8 下载转 MP4 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 m3u8 网络流一键下载转封装为 MP4（ffmpeg `-c copy` 纯 remux），串行队列任务管理、进度上报浮层、设置下载目录，并提供「打开所在文件夹」反馈。

**Architecture:** 主进程新增 `DownloadService`（注入式 spawn，可单测）：任务队列一次只跑一个，`spawn ffmpeg -y -i <url> -c copy <out.mp4>`，解析 stderr `time=` 推进度，失败/取消删除半成品，退出前 `shutdown()` 清理。IPC 通道 `download:start/get/cancel/dismiss/show-in-folder/update`（update 为主进程推送到渲染进程）。渲染进程 store 增加非持久化 `downloads` 状态，新增 `DownloadPopup`（右下角浮层）与 `SettingsOverlay`（下载目录 + 自动续播设置）组件；入口为右键菜单「下载 MP4」+ 右上角下载按钮（仅 m3u8 显示）。

**Tech Stack:** 新增依赖 `ffmpeg-static`（放 dependencies，electron-vite 默认 external 保留运行时 require）；其余沿用 P1-P4（Electron + React 19 + Zustand 5 + Jest 30/jsdom，零新增测试依赖）。

**前置依赖:** P1-P4 已完成并验收（152 用例全绿）。权威 spec：`docs/superpowers/specs/2026-08-08-vhplayer-design.md` §7「m3u8 下载为 MP4」（需求 10）。

## 已确认决策（用户 2026-08-09）

1. **下载入口**：右键菜单「下载 MP4」+ 右上角下载按钮，均仅在当前项为 m3u8 时可用/显示
2. **并发策略**：串行队列，同一时刻最多一个 ffmpeg 进程，新任务排队（UI 显示「等待中」）
3. **完成反馈**：任务行显示完成态 +「打开目录」按钮（`shell.showItemInFolder`），手动关闭移除
4. **保存路径**：**不弹保存对话框**，自动保存到下载目录；下载目录可在设置浮层配置（`settings.downloadDir`），未配置时用系统下载目录（`app.getPath('downloads')`）
5. **打包**：本阶段只做功能（dev 验证），electron-builder/asarUnpack 另开阶段处理
6. **执行分支**：直接在 main 提交（延续 P1-P4），每 Task 一个提交

## 轻量资源约束（延续 P1-P4 硬性要求）

1. 新增依赖仅 `ffmpeg-static`（npm 依赖层面零新增其余项，无 UI 库）
2. `downloads`/`downloadNotice`/`settingsOpen` 为纯 UI 状态，**不纳入 StoreSnapshot 持久化**；`downloadDir` 复用既有 `settings.downloadDir` 字段（持久化路径不变）
3. **下载绝不触碰窗口 bounds/形态**；下载过程与播放完全解耦，切换视频/分屏不影响下载队列

## 文件结构（本计划最终交付）

```
package.json                              Modify：dependencies 增加 ffmpeg-static
src/shared/types.ts                       Modify：DownloadTask/DownloadStatus、IPC 5 个常量、IpcApi.download
src/main/downloadService.ts               Create：纯函数 parseTimeFromLine/sanitizeFileName/resolveOutPath + DownloadService（队列/spawn/取消/关闭清理）
src/main/__tests__/downloadService.test.ts Create：全部单测
src/main/ipc.ts                           Modify：注册 5 个 download handler + update 推送 + 默认目录
src/main/index.ts                         Modify：before-quit 调 downloadService.shutdown()
src/preload/index.ts                      Modify：download API 桥接
tests/setup.ts                            Modify：mock window.api.download（6 个方法）
src/renderer/src/store/appStore.ts        Modify：downloads/downloadNotice/settingsOpen + 5 个 actions
src/renderer/src/store/__tests__/appStoreDownload.test.ts Create
src/renderer/src/components/DownloadPopup.tsx Create
src/renderer/src/components/__tests__/DownloadPopup.test.tsx Create
src/renderer/src/components/SettingsOverlay.tsx Create
src/renderer/src/components/__tests__/SettingsOverlay.test.tsx Create
src/renderer/src/components/ContextMenu.tsx Modify：「下载 MP4」启用 +「设置」启用
src/renderer/src/components/__tests__/ContextMenu.test.tsx Modify：下载项可用性/设置项用例
src/renderer/src/components/PlayerView.tsx Modify：右上角下载按钮（m3u8 时显示）
src/renderer/src/components/__tests__/playerViewResume.test.tsx Modify：下载按钮用例
src/renderer/src/components/icons.tsx      Modify：新增 download 图标
src/renderer/src/App.tsx                   Modify：挂载 DownloadPopup/SettingsOverlay + onUpdate 订阅
src/renderer/src/styles.css                Modify：.download-popup/.settings-overlay 样式
```

## 数据模型（shared/types.ts 新增，Task 1 先加类型、Task 2 加 IPC）

```ts
export type DownloadStatus = 'queued' | 'running' | 'done' | 'error'

export interface DownloadTask {
  id: string
  itemId: string
  title: string
  source: string          // 源地址（m3u8 URL 或本地路径）
  outPath: string         // 输出文件绝对路径
  status: DownloadStatus
  /** 0-1；duration 未知时保持 0（UI 显示不确定进度） */
  progress: number
  duration?: number       // 可选总时长（用于百分比）
  error?: string          // 失败原因（stderr 尾部）
  createdAt: number
}
```

## Task 1: 主进程 DownloadService 核心（TDD）

**Files:**
- Modify: `src/shared/types.ts`（仅加 DownloadTask/DownloadStatus 类型，不含 IPC）
- Create: `src/main/downloadService.ts`
- Test: `src/main/__tests__/downloadService.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DownloadService,
  parseTimeFromLine,
  sanitizeFileName,
  resolveOutPath,
  type SpawnLike
} from '../downloadService'
import type { MediaItem } from '../../../shared/types'

function makeItem(value = 'https://example.com/live.m3u8', title = '测试视频'): MediaItem {
  return { id: 'm1', title, sourceType: 'm3u8', value }
}

interface FakeSpawnRec {
  kill: jest.Mock
  stderrOn: jest.Mock
  closeCb: ((code: number | null) => void) | null
}

function makeSpawnFn(): {
  spawnFn: (cmd: string, args: string[]) => SpawnLike
  recs: FakeSpawnRec[]
  calls: Array<{ cmd: string; args: string[] }>
} {
  const recs: FakeSpawnRec[] = []
  const calls: Array<{ cmd: string; args: string[] }> = []
  const spawnFn = (cmd: string, args: string[]): SpawnLike => {
    calls.push({ cmd, args })
    const rec: FakeSpawnRec = {
      kill: jest.fn(() => true),
      stderrOn: jest.fn(),
      closeCb: null
    }
    recs.push(rec)
    return {
      kill: () => rec.kill(),
      stderr: {
        on: (_event, cb: (chunk: Buffer) => void) => {
          rec.stderrOn(cb)
        }
      },
      on: (_event, cb: (code: number | null) => void) => {
        rec.closeCb = cb
      }
    }
  }
  return { spawnFn, recs, calls }
}

describe('纯函数', () => {
  it('parseTimeFromLine 解析 HH:MM:SS.mmm', () => {
    expect(parseTimeFromLine('frame= 10 fps=0.0 q=-1.0 size= 100kB time=00:01:23.45')).toBe(83.45)
    expect(parseTimeFromLine('time=00:00:59')).toBe(59)
    expect(parseTimeFromLine('no time here')).toBeNull()
    expect(parseTimeFromLine('time=00:01:23.45 时间戳 第二次 time=00:02:00.00')).toBe(120)
  })

  it('sanitizeFileName 清理非法字符，空结果回退 download', () => {
    expect(sanitizeFileName('a/b:c*d?e"f<g>h|i')).toBe('a b c d e f g h i')
    expect(sanitizeFileName('  你好 视频  ')).toBe('你好 视频')
    expect(sanitizeFileName('///')).toBe('download')
  })

  it('resolveOutPath 冲突时追加 (n) 后缀', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vh-dl-'))
    const first = resolveOutPath(dir, '影片')
    writeFileSync(first, 'x')
    const second = resolveOutPath(dir, '影片')
    expect(second).toBe(join(dir, '影片 (1).mp4'))
    expect(resolveOutPath(dir, '影片')).toBe(join(dir, '影片 (1).mp4'))
  })
})

describe('DownloadService', () => {
  it('无 ffmpeg 二进制 → start 返回 null（兜底）', () => {
    const svc = new DownloadService({ ffmpegPath: null, spawnFn: () => { throw new Error('不该调用') } })
    expect(svc.hasFfmpeg()).toBe(false)
    expect(svc.start(makeItem(), 'C:\\tmp')).toBeNull()
  })

  it('串行队列：第二个任务排队，第一个结束后第二个才运行', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    const t1 = svc.start(makeItem('https://a.com/1.m3u8', '一'), 'C:\\tmp')
    const t2 = svc.start(makeItem('https://a.com/2.m3u8', '二'), 'C:\\tmp')
    expect(t1?.status).toBe('running')
    expect(t2?.status).toBe('queued')
    expect(svc.getTasks().map((t) => t.id)).toEqual([t1?.id, t2?.id])
    expect(recs).toHaveLength(1)
    recs[0].closeCb?.(0)
    expect(t2?.status).toBe('running')
    expect(recs).toHaveLength(2)
    recs[1].closeCb?.(0)
    expect(t1?.status).toBe('done')
    expect(t2?.status).toBe('done')
    expect(t1?.progress).toBe(1)
  })

  it('spawn 参数为 -y -i <url> -c copy <out.mp4>', () => {
    const { spawnFn, calls } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    svc.start(makeItem('https://a.com/1.m3u8', '一'), 'C:\\tmp')
    expect(calls[0]).toEqual({
      cmd: 'C:\\ffmpeg.exe',
      args: ['-y', '-i', 'https://a.com/1.m3u8', '-c', 'copy', 'C:\\tmp\\一.mp4']
    })
  })

  it('有 duration 时按 time= 推进度（0-0.999）', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    const t = svc.start(makeItem(), 'C:\\tmp', 100)
    const cb = recs[0].stderrOn.mock.calls[0][0] as (chunk: Buffer) => void
    cb(Buffer.from('time=00:00:50.00'))
    expect(t?.progress).toBeCloseTo(0.5)
    cb(Buffer.from('time=00:02:00.00'))
    expect(t?.progress).toBeCloseTo(0.999)
  })

  it('无 duration 时 progress 保持 0', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    const t = svc.start(makeItem(), 'C:\\tmp')
    const cb = recs[0].stderrOn.mock.calls[0][0] as (chunk: Buffer) => void
    cb(Buffer.from('time=00:01:00.00'))
    expect(t?.progress).toBe(0)
  })

  it('失败（exit≠0）→ status error 且记录 stderr 尾部', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    const t = svc.start(makeItem(), 'C:\\tmp')
    const cb = recs[0].stderrOn.mock.calls[0][0] as (chunk: Buffer) => void
    cb(Buffer.from('https://a.com/1.m3u8: Invalid data found\n'))
    cb(Buffer.from('Connection reset by peer\n'))
    recs[0].closeCb?.(1)
    expect(t?.status).toBe('error')
    expect(t?.error).toContain('Connection reset')
  })

  it('取消 queued 任务：从列表移除且不启动', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    svc.start(makeItem(), 'C:\\tmp')
    const t2 = svc.start(makeItem('https://b.com/2.m3u8', '二'), 'C:\\tmp')
    svc.cancel(t2!.id)
    expect(svc.getTasks().map((t) => t.id)).not.toContain(t2!.id)
    expect(recs).toHaveLength(1)
  })

  it('取消 running 任务：kill 子进程，close 后移除并删除半成品', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    const t = svc.start(makeItem(), 'C:\\tmp')
    svc.cancel(t!.id)
    expect(recs[0].kill).toHaveBeenCalled()
    recs[0].closeCb?.(null)
    expect(svc.getTasks()).toEqual([])
  })

  it('dismiss 移除 done/error 任务（running 忽略）', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    const t = svc.start(makeItem(), 'C:\\tmp')
    recs[0].closeCb?.(0)
    svc.dismiss(t!.id)
    expect(svc.getTasks()).toEqual([])
  })

  it('notify 在状态变化时回调（含进度与完成）', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const notify = jest.fn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn, notify })
    const t = svc.start(makeItem(), 'C:\\tmp', 100)
    const cb = recs[0].stderrOn.mock.calls[0][0] as (chunk: Buffer) => void
    cb(Buffer.from('time=00:00:10.00'))
    recs[0].closeCb?.(0)
    expect(notify).toHaveBeenCalled()
    expect(t?.status).toBe('done')
  })

  it('shutdown：kill 活动子进程、清空队列', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    svc.start(makeItem(), 'C:\\tmp')
    svc.start(makeItem('https://b.com/2.m3u8', '二'), 'C:\\tmp')
    svc.shutdown()
    expect(recs[0].kill).toHaveBeenCalled()
    expect(svc.getTasks()).toEqual([])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx jest src/main/__tests__/downloadService.test.ts`
Expected: FAIL（模块不存在，全部报错）

- [ ] **Step 3: 实现 DownloadService**

`src/shared/types.ts` 第 58 行 `WindowState` 之后追加：

```ts
export type DownloadStatus = 'queued' | 'running' | 'done' | 'error'

export interface DownloadTask {
  id: string
  itemId: string
  title: string
  source: string
  outPath: string
  status: DownloadStatus
  /** 0-1；duration 未知时保持 0（UI 显示不确定进度） */
  progress: number
  duration?: number
  error?: string
  createdAt: number
}
```

Create `src/main/downloadService.ts`：

```ts
import { spawn } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { DownloadTask, MediaItem } from '../shared/types'
import { uid } from '../shared/source'

export interface SpawnLike {
  kill(): boolean
  stderr: { on(event: 'data', cb: (chunk: Buffer) => void): void }
  on(event: 'close', cb: (code: number | null) => void): void
}

export type SpawnFn = (cmd: string, args: string[]) => SpawnLike

function realSpawn(cmd: string, args: string[]): SpawnLike {
  return spawn(cmd, args, { windowsHide: true })
}

/** 解析 stderr 行中的 time=HH:MM:SS(.mmm)，取最后一个（remux 进度） */
export function parseTimeFromLine(line: string): number | null {
  let last: number | null = null
  const re = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    last = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  }
  return last
}

/** 文件名清洗：非法字符替换为空格、去首尾空白；空结果回退 download */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || 'download'
}

/** 输出路径：<dir>/<标题>.mp4，存在时追加 (n) */
export function resolveOutPath(dir: string, title: string): string {
  const base = sanitizeFileName(title)
  let out = join(dir, `${base}.mp4`)
  let n = 1
  while (existsSync(out)) {
    out = join(dir, `${base} (${n}).mp4`)
    n += 1
  }
  return out
}

export interface DownloadServiceOptions {
  spawnFn?: SpawnFn
  ffmpegPath?: string | null
  notify?: (tasks: DownloadTask[]) => void
}

/**
 * m3u8 → MP4 下载服务（串行队列，一次一个 ffmpeg 进程）。
 * 纯 remux（-c copy）：主进程 spawn，解析 stderr time= 推进度，
 * 失败/取消删除半成品；shutdown 在退出前清理。
 */
export class DownloadService {
  private readonly spawnFn: SpawnFn
  private readonly ffmpegPath: string | null
  private readonly notify?: (tasks: DownloadTask[]) => void
  private tasks: DownloadTask[] = []
  private active: DownloadTask | null = null
  private child: SpawnLike | null = null

  constructor(opts: DownloadServiceOptions = {}) {
    this.spawnFn = opts.spawnFn ?? realSpawn
    this.ffmpegPath = opts.ffmpegPath === undefined ? ((require('ffmpeg-static') as string) ?? null) : opts.ffmpegPath
    this.notify = opts.notify
  }

  hasFfmpeg(): boolean {
    return !!this.ffmpegPath
  }

  getTasks(): DownloadTask[] {
    return this.tasks.map((t) => ({ ...t }))
  }

  findTask(taskId: string): DownloadTask | undefined {
    return this.tasks.find((t) => t.id === taskId)
  }

  /** 入队并尝试启动；无 ffmpeg 返回 null（渲染进程提示） */
  start(item: MediaItem, downloadDir: string, duration?: number): DownloadTask | null {
    if (!this.ffmpegPath) return null
    const task: DownloadTask = {
      id: uid(),
      itemId: item.id,
      title: item.title,
      source: item.value,
      outPath: resolveOutPath(downloadDir, item.title),
      status: 'queued',
      progress: 0,
      duration,
      createdAt: Date.now()
    }
    this.tasks.push(task)
    this.emit()
    this.pump()
    return this.tasks[this.tasks.length - 1]
  }

  /** 取消：queued 直接移除；running kill 子进程，close 后清理 */
  cancel(taskId: string): void {
    const idx = this.tasks.findIndex((t) => t.id === taskId)
    if (idx >= 0) {
      this.tasks.splice(idx, 1)
      this.emit()
      return
    }
    if (this.active?.id === taskId) {
      this.child?.kill()
    }
  }

  /** 移除已完成/失败任务（UI 手动关闭）；running/queued 忽略 */
  dismiss(taskId: string): void {
    const t = this.tasks.find((x) => x.id === taskId)
    if (!t || t.status === 'running' || t.status === 'queued') return
    this.tasks = this.tasks.filter((x) => x.id !== taskId)
    this.emit()
  }

  /** 退出前清理：kill 活动子进程、删半成品、清空队列 */
  shutdown(): void {
    this.child?.kill()
    this.child = null
    if (this.active && this.active.status !== 'done') {
      try {
        unlinkSync(this.active.outPath)
      } catch {
        // 半成品可能不存在
      }
    }
    this.active = null
    this.tasks = []
  }

  private pump(): void {
    if (this.active || this.tasks.length === 0) return
    const task = this.tasks.find((t) => t.status === 'queued')
    if (!task) return
    this.active = task
    task.status = 'running'
    this.emit()
    this.run(task)
  }

  private run(task: DownloadTask): void {
    if (!this.ffmpegPath) return
    const child = this.spawnFn(this.ffmpegPath, ['-y', '-i', task.source, '-c', 'copy', task.outPath])
    this.child = child
    let buffer = ''
    let lastTime = 0
    child.stderr.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const t = parseTimeFromLine(line)
        if (t !== null) lastTime = t
      }
      if (task.duration && task.duration > 0 && lastTime > 0) {
        task.progress = Math.min(0.999, lastTime / task.duration)
        this.emit()
      }
    })
    child.on('close', (code) => {
      this.child = null
      this.active = null
      const stillListed = this.tasks.some((t) => t.id === task.id)
      if (code === 0) {
        task.status = 'done'
        task.progress = 1
        if (stillListed) this.emit()
      } else {
        // 取消（kill 后 close 且任务已被移除）→ 已删半成品
        if (!stillListed) {
          try {
            unlinkSync(task.outPath)
          } catch {
            // 输出可能未创建
          }
          return
        }
        task.status = 'error'
        task.error = buffer.trim().slice(-200)
        try {
          unlinkSync(task.outPath)
        } catch {
          // 半成品可能不存在
        }
        this.emit()
      }
      this.pump()
    })
  }

  private emit(): void {
    this.notify?.(this.getTasks())
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx jest src/main/__tests__/downloadService.test.ts`
Expected: PASS（15 用例）

- [ ] **Step 5: 提交**

```bash
git add src/shared/types.ts src/main/downloadService.ts src/main/__tests__/downloadService.test.ts
git commit -m "feat: 主进程下载服务 DownloadService（串行队列、stderr 进度、失败/取消删半成品、shutdown 清理）"
```

## Task 2: IPC + preload + 退出清理 + 测试 mock

**Files:**
- Modify: `src/shared/types.ts`（IPC 常量 + IpcApi.download）
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `tests/setup.ts`

- [ ] **Step 1: 扩展类型与 mock**

`src/shared/types.ts` IPC 常量（`appReadyToClose` 后）追加：

```ts
  downloadStart: 'download:start',
  downloadGet: 'download:get',
  downloadCancel: 'download:cancel',
  downloadDismiss: 'download:dismiss',
  downloadShowInFolder: 'download:show-in-folder',
  downloadUpdate: 'download:update'
```

`IpcApi`（`app` 前）追加：

```ts
  download: {
    get(): Promise<DownloadTask[]>
    start(item: MediaItem, duration?: number): Promise<DownloadTask | null>
    cancel(taskId: string): Promise<void>
    dismiss(taskId: string): Promise<void>
    showInFolder(taskId: string): Promise<void>
    onUpdate(callback: (tasks: DownloadTask[]) => void): () => void
  }
```

`tests/setup.ts` 的 `app` mock 后追加：

```ts
    download: {
      get: jest.fn(() => Promise.resolve([])),
      start: jest.fn(() => Promise.resolve(null)),
      cancel: jest.fn(() => Promise.resolve()),
      dismiss: jest.fn(() => Promise.resolve()),
      showInFolder: jest.fn(() => Promise.resolve()),
      onUpdate: jest.fn(() => () => {})
    },
```

- [ ] **Step 2: 实现主进程 IPC 与推送**

`src/main/ipc.ts`：

```ts
import { BrowserWindow, ipcMain, screen, shell } from 'electron'
import { app } from 'electron'
import { IPC, type DownloadTask, type MediaItem, type StoreSnapshot } from '../shared/types'
import { DownloadService } from './downloadService'
```

`registerIpc` 内 `const store = ...` 之后、`store` 相关 handler 之前：

```ts
  const downloadService = new DownloadService({
    notify: (tasks: DownloadTask[]) => {
      if (!win.isDestroyed()) win.webContents.send(IPC.downloadUpdate, tasks)
    }
  })

  // 主进程统一出口：下载目录可配置（settings.downloadDir），未配置用系统下载目录
  const downloadDir = (): string => store.getSettings().downloadDir || app.getPath('downloads')

  ipcMain.handle(IPC.downloadStart, (_event, item: MediaItem, duration?: number) => downloadService.start(item, downloadDir(), duration))
  ipcMain.handle(IPC.downloadGet, () => downloadService.getTasks())
  ipcMain.handle(IPC.downloadCancel, (_event, taskId: string) => downloadService.cancel(taskId))
  ipcMain.handle(IPC.downloadDismiss, (_event, taskId: string) => downloadService.dismiss(taskId))
  ipcMain.handle(IPC.downloadShowInFolder, (_event, taskId: string) => {
    const task = downloadService.findTask(taskId)
    if (task) shell.showItemInFolder(task.outPath)
  })
```

退出清理：`downloadService` 实例提升为模块级引用。`src/main/ipc.ts` 底部追加：

```ts
export const downloadServiceRef: { current: DownloadService | null } = { current: null }
```

`registerIpc` 内创建后赋值：

```ts
  downloadServiceRef.current = downloadService
```

`src/main/index.ts` 的 `registerIpc(win)` 之后追加：

```ts
  app.on('before-quit', () => {
    // 下载中退出：杀掉 ffmpeg 子进程并删除半成品（避免残留）
    downloadServiceRef.current?.shutdown()
  })
```

import 增加 `import { downloadServiceRef } from './ipc'`。

- [ ] **Step 3: preload 桥接**

`src/preload/index.ts` 的 `media` 之后、`app` 之前追加：

```ts
  download: {
    get: () => ipcRenderer.invoke(IPC.downloadGet),
    start: (item: MediaItem, duration?: number) => ipcRenderer.invoke(IPC.downloadStart, item, duration),
    cancel: (taskId: string) => ipcRenderer.invoke(IPC.downloadCancel, taskId),
    dismiss: (taskId: string) => ipcRenderer.invoke(IPC.downloadDismiss, taskId),
    showInFolder: (taskId: string) => ipcRenderer.invoke(IPC.downloadShowInFolder, taskId),
    onUpdate: (callback: (tasks: DownloadTask[]) => void) => {
      const listener = (_event: unknown, tasks: DownloadTask[]): void => callback(tasks)
      ipcRenderer.on(IPC.downloadUpdate, listener)
      return () => {
        ipcRenderer.removeListener(IPC.downloadUpdate, listener)
      }
    }
  },
```

（import 增加 `DownloadTask`、`MediaItem` 类型。）

- [ ] **Step 4: 验证**

Run: `npm run typecheck; npx jest src/main src/renderer/src/store/__tests__/appStoreGrid.test.ts`
Expected: typecheck 无报错；全部 PASS（setup mock 新增字段不破坏既有用例）

- [ ] **Step 5: 提交**

```bash
git add src/shared/types.ts src/main/ipc.ts src/main/index.ts src/preload/index.ts tests/setup.ts
git commit -m "feat: 下载 IPC 通道（start/get/cancel/dismiss/show-in-folder/update 推送），退出前 shutdown 清理 ffmpeg"
```

## Task 3: 渲染进程 store（TDD）

**Files:**
- Modify: `src/renderer/src/store/appStore.ts`
- Test: `src/renderer/src/store/__tests__/appStoreDownload.test.ts`（Create）

- [ ] **Step 1: 写失败测试**

```ts
import { useAppStore } from '../appStore'
import type { Playlist } from '../../../../shared/types'

function resetState(): void {
  useAppStore.setState({
    viewMode: 'single',
    activeInstance: 0,
    downloads: [],
    downloadNotice: null,
    settingsOpen: false,
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
    playlists: [],
    favorites: { id: 'favorites', name: '收藏', items: [], createdAt: 0 }
  })
  ;(window.api.download.start as jest.Mock).mockClear()
  ;(window.api.download.cancel as jest.Mock).mockClear()
  ;(window.api.download.dismiss as jest.Mock).mockClear()
}

function makePlaylist(sourceType: 'm3u8' | 'file' = 'm3u8'): Playlist {
  return {
    id: 'p1',
    name: '列表',
    items: [
      { id: 'm1', title: '流', sourceType, value: 'https://a.com/1.m3u8', createdAt: 1 },
      { id: 'm2', title: '二', sourceType: 'm3u8', value: 'https://a.com/2.m3u8', createdAt: 2 }
    ],
    createdAt: 1
  }
}

describe('下载 store actions', () => {
  beforeEach(resetState)

  it('downloadItem：活动实例当前 m3u8 → 调 start，无 duration 时传 undefined', async () => {
    useAppStore.setState({ playlists: [makePlaylist()] })
    useAppStore.getState().updateInstance(0, { playlistId: 'p1', currentIndex: 0 })
    ;(window.api.download.start as jest.Mock).mockResolvedValue({
      id: 't1', itemId: 'm1', title: '流', source: 'https://a.com/1.m3u8', outPath: 'C:\\dl\\流.mp4',
      status: 'running', progress: 0, createdAt: 1
    })
    await useAppStore.getState().downloadItem()
    expect(window.api.download.start).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1' }),
      undefined
    )
  })

  it('downloadItem：有播放中视频时传其 duration', async () => {
    useAppStore.setState({ playlists: [makePlaylist()] })
    useAppStore.getState().updateInstance(0, { playlistId: 'p1', currentIndex: 0 })
    const v = document.createElement('video')
    Object.defineProperty(v, 'duration', { configurable: true, get: () => 123 })
    useAppStore.getState().registerVideo(0, v)
    ;(window.api.download.start as jest.Mock).mockResolvedValue(null)
    await useAppStore.getState().downloadItem()
    expect(window.api.download.start).toHaveBeenCalledWith(expect.anything(), 123)
  })

  it('downloadItem：当前项非 m3u8 → 不调用', async () => {
    useAppStore.setState({ playlists: [makePlaylist('file')] })
    useAppStore.getState().updateInstance(0, { playlistId: 'p1', currentIndex: 0 })
    await useAppStore.getState().downloadItem()
    expect(window.api.download.start).not.toHaveBeenCalled()
  })

  it('downloadItem：无当前项 → 不调用', async () => {
    await useAppStore.getState().downloadItem()
    expect(window.api.download.start).not.toHaveBeenCalled()
  })

  it('downloadItem：start 返回 null（无 ffmpeg）→ 设置 downloadNotice，5s 后自动清除', async () => {
    jest.useFakeTimers()
    useAppStore.setState({ playlists: [makePlaylist()] })
    useAppStore.getState().updateInstance(0, { playlistId: 'p1', currentIndex: 0 })
    ;(window.api.download.start as jest.Mock).mockResolvedValue(null)
    await useAppStore.getState().downloadItem()
    expect(useAppStore.getState().downloadNotice).toBeTruthy()
    jest.advanceTimersByTime(5000)
    expect(useAppStore.getState().downloadNotice).toBeNull()
    jest.useRealTimers()
  })

  it('cancelDownload/dismissDownload 转发 IPC', async () => {
    await useAppStore.getState().cancelDownload('t1')
    expect(window.api.download.cancel).toHaveBeenCalledWith('t1')
    await useAppStore.getState().dismissDownload('t1')
    expect(window.api.download.dismiss).toHaveBeenCalledWith('t1')
  })

  it('setDownloads 全量替换任务列表', () => {
    const tasks = [{ id: 't1', itemId: 'm1', title: 'x', source: 'u', outPath: 'p', status: 'done' as const, progress: 1, createdAt: 1 }]
    useAppStore.getState().setDownloads(tasks)
    expect(useAppStore.getState().downloads).toEqual(tasks)
  })

  it('openSettings/closeSettings 控制设置浮层', () => {
    useAppStore.getState().openSettings()
    expect(useAppStore.getState().settingsOpen).toBe(true)
    useAppStore.getState().closeSettings()
    expect(useAppStore.getState().settingsOpen).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx jest src/renderer/src/store/__tests__/appStoreDownload.test.ts`
Expected: FAIL（downloads/downloadItem 等不存在）

- [ ] **Step 3: 实现 store**

`src/renderer/src/store/appStore.ts` import 增加 `DownloadTask`；接口 `AppStore` 增加（`closeUrlInput` 后）：

```ts
  downloads: DownloadTask[]
  downloadNotice: string | null
  settingsOpen: boolean
  downloadItem(): Promise<void>
  cancelDownload(taskId: string): Promise<void>
  dismissDownload(taskId: string): Promise<void>
  setDownloads(tasks: DownloadTask[]): void
  openSettings(): void
  closeSettings(): void
  clearDownloadNotice(): void
```

初始值（`urlInputOpen` 后）：

```ts
  downloads: [],
  downloadNotice: null,
  settingsOpen: false,
```

actions（`closeUrlInput` 后）：

```ts
  downloadItem: async () => {
    const state = useAppStore.getState()
    const ins = state.instances[state.activeInstance]
    const list = ins.playlistId === 'favorites' ? state.favorites : state.playlists.find((p) => p.id === ins.playlistId)
    const item = list?.items[ins.currentIndex]
    if (!item || item.sourceType !== 'm3u8') return
    const video = state.videoRegistry[state.activeInstance]
    const duration = video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined
    const task = await window.api.download.start(item, duration)
    if (!task) {
      useAppStore.setState({ downloadNotice: '未找到 ffmpeg，无法下载' })
      setTimeout(() => useAppStore.setState({ downloadNotice: null }), 5000)
    }
  },

  cancelDownload: async (taskId) => {
    await window.api.download.cancel(taskId)
  },

  dismissDownload: async (taskId) => {
    await window.api.download.dismiss(taskId)
  },

  setDownloads: (tasks) => set({ downloads: tasks }),

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  clearDownloadNotice: () => set({ downloadNotice: null })
```

- [ ] **Step 4: 运行确认通过**

Run: `npx jest src/renderer/src/store; npm run typecheck`
Expected: PASS（appStoreActions + appStoreGrid + appStoreDownload + playlistUtils 全绿）、typecheck 无报错

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/store/appStore.ts src/renderer/src/store/__tests__/appStoreDownload.test.ts
git commit -m "feat: 下载任务 store 状态与 actions（downloadItem 仅 m3u8、notice 兜底提示、设置浮层开关）"
```

## Task 4: DownloadPopup 组件（TDD）

**Files:**
- Modify: `src/renderer/src/components/icons.tsx`（download 图标）
- Create: `src/renderer/src/components/DownloadPopup.tsx`
- Test: `src/renderer/src/components/__tests__/DownloadPopup.test.tsx`（Create）

- [ ] **Step 1: 写失败测试**

```tsx
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import DownloadPopup from '../DownloadPopup'
import { useAppStore } from '../../store/appStore'
import type { DownloadTask } from '../../../../shared/types'

function task(partial: Partial<DownloadTask>): DownloadTask {
  return {
    id: 't1',
    itemId: 'm1',
    title: '测试流',
    source: 'https://a.com/1.m3u8',
    outPath: 'C:\\dl\\测试流.mp4',
    status: 'running',
    progress: 0,
    createdAt: 1,
    ...partial
  }
}

describe('DownloadPopup', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    useAppStore.setState({ downloads: [], downloadNotice: null })
    ;(window.api.download.cancel as jest.Mock).mockClear()
    ;(window.api.download.dismiss as jest.Mock).mockClear()
    ;(window.api.download.showInFolder as jest.Mock).mockClear()
    act(() => {
      root = createRoot(container)
      root.render(<DownloadPopup />)
    })
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
      root = null
      container.remove()
    })
  })

  it('无任务且无 notice → 不渲染', () => {
    expect(container.innerHTML).toBe('')
  })

  it('渲染任务行：标题 + 进度条 + 状态文案', () => {
    act(() => {
      useAppStore.setState({ downloads: [task({ status: 'running', progress: 0.5 })] })
    })
    const el = container.querySelector('.download-popup') as HTMLElement
    expect(el).toBeTruthy()
    expect(el.textContent).toContain('测试流')
    expect(el.textContent).toContain('50%')
    expect(container.querySelector('.download-progress-fill') as HTMLElement).toBeTruthy()
  })

  it('running 任务显示取消按钮 → cancelDownload', () => {
    act(() => {
      useAppStore.setState({ downloads: [task({})] })
    })
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.title === '取消') as HTMLElement
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(window.api.download.cancel).toHaveBeenCalledWith('t1')
  })

  it('queued 任务文案为等待中', () => {
    act(() => {
      useAppStore.setState({ downloads: [task({ status: 'queued', progress: 0 })] })
    })
    expect(container.querySelector('.download-popup')?.textContent).toContain('等待中')
  })

  it('done 任务：显示完成 + 打开目录按钮 + 移除按钮', () => {
    act(() => {
      useAppStore.setState({ downloads: [task({ status: 'done', progress: 1 })] })
    })
    expect(container.querySelector('.download-popup')?.textContent).toContain('已完成')
    const open = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('打开目录')) as HTMLElement
    act(() => {
      open.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(window.api.download.showInFolder).toHaveBeenCalledWith('t1')
    const close = Array.from(container.querySelectorAll('button')).find((b) => b.title === '移除') as HTMLElement
    act(() => {
      close.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(window.api.download.dismiss).toHaveBeenCalledWith('t1')
  })

  it('error 任务：显示错误信息', () => {
    act(() => {
      useAppStore.setState({ downloads: [task({ status: 'error', error: 'Connection reset' })] })
    })
    expect(container.querySelector('.download-popup')?.textContent).toContain('失败')
    expect(container.querySelector('.download-popup')?.textContent).toContain('Connection reset')
  })

  it('downloadNotice 显示提示条', () => {
    act(() => {
      useAppStore.setState({ downloadNotice: '未找到 ffmpeg，无法下载' })
    })
    expect(container.querySelector('.download-popup')?.textContent).toContain('未找到 ffmpeg')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx jest src/renderer/src/components/__tests__/DownloadPopup.test.tsx`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现组件与图标**

`src/renderer/src/components/icons.tsx`：`IconName` 加 `'download'`；`ICON_PATHS`（`grid` 后）追加：

```tsx
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>
  ),
```

Create `src/renderer/src/components/DownloadPopup.tsx`：

```tsx
import { useAppStore } from '../store/appStore'
import type { DownloadTask } from '../../../shared/types'
import { Icon } from './icons'

function statusLabel(t: DownloadTask): string {
  if (t.status === 'queued') return '等待中'
  if (t.status === 'done') return '已完成'
  if (t.status === 'error') return '失败'
  return `${Math.round(t.progress * 100)}%`
}

export default function DownloadPopup(): React.JSX.Element | null {
  const downloads = useAppStore((s) => s.downloads)
  const notice = useAppStore((s) => s.downloadNotice)

  if (downloads.length === 0 && !notice) return null

  return (
    <div className="download-popup">
      {notice && (
        <div className="download-notice">
          <span>{notice}</span>
        </div>
      )}
      {downloads.map((t) => (
        <div key={t.id} className={`download-task ${t.status}`}>
          <div className="download-task-main">
            <span className="download-task-title" title={t.title}>
              {t.title}
            </span>
            <span className="download-task-label">{statusLabel(t)}</span>
          </div>
          <div className="download-progress">
            <div
              className={`download-progress-fill${t.duration ? '' : ' indeterminate'}`}
              style={t.duration ? { width: `${t.progress * 100}%` } : undefined}
            />
          </div>
          {t.error && <div className="download-task-error">{t.error}</div>}
          <div className="download-task-actions">
            {(t.status === 'running' || t.status === 'queued') && (
              <button title="取消" onClick={() => void useAppStore.getState().cancelDownload(t.id)}>
                <Icon name="x" size={13} />
              </button>
            )}
            {t.status === 'done' && (
              <button title="打开目录" onClick={() => void window.api.download.showInFolder(t.id)}>
                打开目录
              </button>
            )}
            {(t.status === 'done' || t.status === 'error') && (
              <button title="移除" onClick={() => void useAppStore.getState().dismissDownload(t.id)}>
                <Icon name="x" size={13} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
```

> 说明：`indeterminate` 类仅在 `t.duration` 未知时由 CSS 走无限滚动动画（宽度由 CSS 控制，style 不注入）。

- [ ] **Step 4: 运行确认通过**

Run: `npx jest src/renderer/src/components/__tests__/DownloadPopup.test.tsx; npm run typecheck`
Expected: PASS（7 用例）、typecheck 通过

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/icons.tsx src/renderer/src/components/DownloadPopup.tsx src/renderer/src/components/__tests__/DownloadPopup.test.tsx
git commit -m "feat: 下载进度浮层 DownloadPopup（进度/等待/取消/打开目录/失败提示）"
```

## Task 5: SettingsOverlay 设置浮层（TDD）

**Files:**
- Create: `src/renderer/src/components/SettingsOverlay.tsx`
- Test: `src/renderer/src/components/__tests__/SettingsOverlay.test.tsx`（Create）

- [ ] **Step 1: 写失败测试**

```tsx
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import SettingsOverlay from '../SettingsOverlay'
import { useAppStore } from '../../store/appStore'

describe('SettingsOverlay', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    useAppStore.setState({ settingsOpen: false, settings: { downloadDir: '', autoResume: true } })
    ;(window.api.dialog.openFolder as jest.Mock).mockClear()
    act(() => {
      root = createRoot(container)
      root.render(<SettingsOverlay />)
    })
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
      root = null
      container.remove()
    })
  })

  it('settingsOpen=false 不渲染', () => {
    expect(container.innerHTML).toBe('')
  })

  it('打开时显示下载目录（未配置显示默认文案）与自动续播开关', () => {
    act(() => {
      useAppStore.setState({ settingsOpen: true })
    })
    expect(container.querySelector('.settings-overlay')?.textContent).toContain('系统下载目录')
    expect(container.querySelector('.settings-overlay')?.textContent).toContain('自动续播')
  })

  it('选择目录：openFolder 后写入 settings.downloadDir', async () => {
    act(() => {
      useAppStore.setState({ settingsOpen: true })
    })
    ;(window.api.dialog.openFolder as jest.Mock).mockResolvedValue('D:\\视频下载')
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('选择目录')) as HTMLElement
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(window.api.dialog.openFolder).toHaveBeenCalled()
    expect(useAppStore.getState().settings.downloadDir).toBe('D:\\视频下载')
  })

  it('恢复默认：清空 downloadDir', () => {
    act(() => {
      useAppStore.setState({ settingsOpen: true, settings: { downloadDir: 'D:\\dl', autoResume: true } })
    })
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('恢复默认')) as HTMLElement
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().settings.downloadDir).toBe('')
  })

  it('自动续播开关切换', () => {
    act(() => {
      useAppStore.setState({ settingsOpen: true })
    })
    const box = container.querySelector('.settings-checkbox input') as HTMLInputElement
    act(() => {
      box.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().settings.autoResume).toBe(false)
  })

  it('Esc 关闭浮层', () => {
    act(() => {
      useAppStore.setState({ settingsOpen: true })
    })
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(useAppStore.getState().settingsOpen).toBe(false)
  })

  it('点遮罩关闭', () => {
    act(() => {
      useAppStore.setState({ settingsOpen: true })
    })
    const mask = container.querySelector('.settings-mask') as HTMLElement
    act(() => {
      mask.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().settingsOpen).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx jest src/renderer/src/components/__tests__/SettingsOverlay.test.tsx`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现组件**

Create `src/renderer/src/components/SettingsOverlay.tsx`：

```tsx
import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { Icon } from './icons'

export default function SettingsOverlay(): React.JSX.Element | null {
  const open = useAppStore((s) => s.settingsOpen)
  const settings = useAppStore((s) => s.settings)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useAppStore.getState().closeSettings()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const state = useAppStore.getState()

  const pickDir = (): void => {
    void (async () => {
      const dir = await window.api.dialog.openFolder()
      if (dir) state.setSettings({ downloadDir: dir })
    })()
  }

  return (
    <>
      <div className="settings-mask" onClick={() => state.closeSettings()} />
      <div className="settings-overlay">
        <div className="settings-header">
          <span>设置</span>
          <button className="panel-close" title="关闭" onClick={() => state.closeSettings()}>
            <Icon name="x" />
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">下载目录</div>
          <div className="settings-row-body">
            <span className="settings-dir-path" title={settings.downloadDir}>
              {settings.downloadDir || '系统下载目录'}
            </span>
            <button onClick={pickDir}>选择目录</button>
            {settings.downloadDir && <button onClick={() => state.setSettings({ downloadDir: '' })}>恢复默认</button>}
          </div>
        </div>
        <label className="settings-row settings-checkbox">
          <input
            type="checkbox"
            checked={settings.autoResume}
            onChange={(e) => state.setSettings({ autoResume: e.target.checked })}
          />
          <span>自动续播（打开时从上次位置继续）</span>
        </label>
      </div>
    </>
  )
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx jest src/renderer/src/components/__tests__/SettingsOverlay.test.tsx; npm run typecheck`
Expected: PASS（7 用例）、typecheck 通过

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/SettingsOverlay.tsx src/renderer/src/components/__tests__/SettingsOverlay.test.tsx
git commit -m "feat: 设置浮层（下载目录选择/恢复默认、自动续播开关，Esc/遮罩关闭）"
```

## Task 6: 入口接线（右键菜单 + 下载按钮 + App 挂载）

**Files:**
- Modify: `src/renderer/src/components/ContextMenu.tsx`
- Modify: `src/renderer/src/components/__tests__/ContextMenu.test.tsx`
- Modify: `src/renderer/src/components/PlayerView.tsx`
- Modify: `src/renderer/src/components/__tests__/playerViewResume.test.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: ContextMenu 启用下载与设置**

`entries` 中 `{ id: 'download', label: '下载 MP4', disabled: true }` 改为：

```tsx
    {
      id: 'download',
      label: '下载 MP4',
      disabled: !hasItem || item.sourceType !== 'm3u8',
      action: () => void state.downloadItem()
    },
```

`{ id: 'settings', label: '设置', disabled: true }` 改为：

```tsx
    { id: 'settings', label: '设置', action: () => state.openSettings() },
```

- [ ] **Step 2: ContextMenu 测试更新**

`ContextMenu.test.tsx` 新增 describe（沿用既有 renderMenu 模式，先读该文件确认 helper 结构）：

```tsx
describe('下载与设置入口', () => {
  it('m3u8 项 → 下载 MP4 可用', () => {
    useAppStore.setState({
      instances: [0, 1, 2, 3].map((id) => ({
        id,
        playlistId: id === 0 ? 'p1' : null,
        currentIndex: 0,
        playMode: 'order' as const,
        isPlaying: false,
        volume: 1,
        rate: 1,
        scaleMode: 'contain' as const
      })),
      playlists: [
        {
          id: 'p1',
          name: '流',
          items: [{ id: 'm1', title: '流', sourceType: 'm3u8' as const, value: 'https://a.com/1.m3u8' }],
          createdAt: 1
        }
      ]
    })
    renderMenu()
    const item = Array.from(container.querySelectorAll('.menu-item')).find((e) =>
      e.textContent?.includes('下载 MP4')
    ) as HTMLElement
    expect(item.classList.contains('disabled')).toBe(false)
  })

  it('非 m3u8 项 → 下载 MP4 禁用', () => {
    useAppStore.setState({
      instances: [0, 1, 2, 3].map((id) => ({
        id,
        playlistId: id === 0 ? 'p1' : null,
        currentIndex: 0,
        playMode: 'order' as const,
        isPlaying: false,
        volume: 1,
        rate: 1,
        scaleMode: 'contain' as const
      })),
      playlists: [
        {
          id: 'p1',
          name: '本',
          items: [{ id: 'm1', title: '本', sourceType: 'file' as const, value: 'C:\\a.mp4' }],
          createdAt: 1
        }
      ]
    })
    renderMenu()
    const item = Array.from(container.querySelectorAll('.menu-item')).find((e) =>
      e.textContent?.includes('下载 MP4')
    ) as HTMLElement
    expect(item.classList.contains('disabled')).toBe(true)
  })

  it('设置项 → openSettings', () => {
    useAppStore.setState({ settingsOpen: false })
    renderMenu()
    const item = Array.from(container.querySelectorAll('.menu-item')).find((e) =>
      e.textContent?.includes('设置')
    ) as HTMLElement
    act(() => {
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().settingsOpen).toBe(true)
  })
})
```

- [ ] **Step 3: PlayerView 下载按钮**

`globe` 按钮之后、`grid` 按钮之前插入：

```tsx
        {currentItem?.sourceType === 'm3u8' && (
          <button title="下载 MP4" onClick={() => void useAppStore.getState().downloadItem()}>
            <Icon name="download" />
          </button>
        )}
```

- [ ] **Step 4: playerViewResume 测试补下载按钮用例**

该文件 describe 内追加（先读该文件确认渲染 helper 与 `container` 可用性）：

```tsx
  it('当前项为 m3u8 时显示下载按钮', () => {
    useAppStore.setState({
      playlists: [
        {
          id: 'p1',
          name: '流',
          items: [{ id: 'm1', title: '流', sourceType: 'm3u8', value: 'https://a.com/1.m3u8' }],
          createdAt: 1
        }
      ]
    })
    useAppStore.getState().updateInstance(0, { playlistId: 'p1', currentIndex: 0 })
    act(() => {
      useAppStore.getState().updateInstance(0, { currentIndex: 0 })
    })
    const btn = Array.from(container.querySelectorAll('.player-actions button')).find((b) => b.title === '下载 MP4')
    expect(btn).toBeTruthy()
  })

  it('本地文件项不显示下载按钮', () => {
    useAppStore.setState({
      playlists: [
        {
          id: 'p1',
          name: '本',
          items: [{ id: 'm1', title: '本', sourceType: 'file', value: 'C:\\a.mp4' }],
          createdAt: 1
        }
      ]
    })
    useAppStore.getState().updateInstance(0, { playlistId: 'p1', currentIndex: 0 })
    act(() => {
      useAppStore.getState().updateInstance(0, { currentIndex: 0 })
    })
    expect(Array.from(container.querySelectorAll('.player-actions button')).some((b) => b.title === '下载 MP4')).toBe(false)
  })
```

- [ ] **Step 5: App 挂载与订阅**

`App.tsx` import 增加：

```tsx
import DownloadPopup from './components/DownloadPopup'
import SettingsOverlay from './components/SettingsOverlay'
```

挂载 effect 增加（`useShortcuts()` 之后）：

```tsx
  useEffect(() => {
    window.api.download.get().then((tasks) => useAppStore.getState().setDownloads(tasks))
    return window.api.download.onUpdate((tasks) => useAppStore.getState().setDownloads(tasks))
  }, [])
```

根 div 尾部（`{urlInputOpen && ...}` 之后）追加：

```tsx
      <DownloadPopup />
      <SettingsOverlay />
```

- [ ] **Step 6: 运行全部相关测试**

Run: `npx jest src/renderer/src/components/__tests__/ContextMenu.test.tsx src/renderer/src/components/__tests__/playerViewResume.test.tsx src/renderer/src/components/__tests__/App.test.tsx; npm run typecheck`
Expected: 全部 PASS、typecheck 无报错

- [ ] **Step 7: 提交**

```bash
git add src/renderer/src/components/ContextMenu.tsx src/renderer/src/components/__tests__/ContextMenu.test.tsx src/renderer/src/components/PlayerView.tsx src/renderer/src/components/__tests__/playerViewResume.test.tsx src/renderer/src/App.tsx
git commit -m "feat: 下载/设置入口接线（右键菜单仅 m3u8、右上按钮、浮层挂载与下载列表订阅）"
```

## Task 7: 样式

**Files:**
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: 追加样式**

文件末尾追加（延续现有深色沉浸风格，参考 `.context-menu`/`.side-panel`）：

```css
/* ---- 下载浮层（右下角） ---- */
.download-popup {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 320px;
  pointer-events: none;
}

.download-notice {
  pointer-events: auto;
  background: rgba(20, 20, 22, 0.95);
  border: 1px solid #2a2a2e;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: #ff8a5c;
}

.download-task {
  pointer-events: auto;
  background: rgba(20, 20, 22, 0.95);
  border: 1px solid #2a2a2e;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.download-task.error {
  border-color: rgba(254, 44, 85, 0.5);
}

.download-task-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.download-task-title {
  font-size: 12px;
  color: #e8e8ea;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.download-task-label {
  font-size: 11px;
  color: #9a9aa0;
  white-space: nowrap;
}

.download-progress {
  height: 4px;
  border-radius: 2px;
  background: #2a2a2e;
  overflow: hidden;
}

.download-progress-fill {
  height: 100%;
  background: #fe2c55;
  transition: width 0.3s;
}

.download-progress-fill.indeterminate {
  width: 30%;
  animation: download-slide 1.2s ease-in-out infinite;
}

@keyframes download-slide {
  0% { margin-left: -30%; }
  100% { margin-left: 100%; }
}

.download-task-error {
  font-size: 11px;
  color: #ff6b6b;
  word-break: break-all;
}

.download-task-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.download-task-actions button {
  background: transparent;
  border: none;
  color: #9a9aa0;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 4px;
}

.download-task-actions button:hover {
  color: #ffffff;
  background: #2a2a2e;
}

/* ---- 设置浮层 ---- */
.settings-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 70;
}

.settings-overlay {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 420px;
  max-width: 90vw;
  background: #141416;
  border: 1px solid #2a2a2e;
  border-radius: 12px;
  z-index: 71;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: #e8e8ea;
}

.settings-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-row-label {
  font-size: 12px;
  color: #9a9aa0;
}

.settings-row-body {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-dir-path {
  flex: 1;
  font-size: 12px;
  color: #e8e8ea;
  background: #1c1c1f;
  border: 1px solid #2a2a2e;
  border-radius: 6px;
  padding: 6px 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.settings-row-body button,
.settings-checkbox {
  background: transparent;
  border: 1px solid #2a2a2e;
  color: #e8e8ea;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.settings-row-body button:hover {
  border-color: #fe2c55;
  color: #ffffff;
}

.settings-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  padding: 0;
  cursor: pointer;
}
```

- [ ] **Step 2: 验证与提交**

Run: `npm run typecheck`
Expected: 无报错

```bash
git add src/renderer/src/styles.css
git commit -m "style: 下载浮层与设置浮层样式（进度条/不确定动画/错误态）"
```

## Task 8: 收尾验证与验收

**Files:** 无新增（依赖安装属 Task 1 前置，此处全量验证）

- [ ] **Step 1: 全量验证**

```bash
npm run typecheck
npm test
npm run build
```

预期：typecheck 无报错；测试全绿（预计 152 + 新增约 45 用例）；build 成功产出 out/。

- [ ] **Step 2: 手动验收（dev）**

```bash
npm run dev
```

验收清单（对应 spec §7 + 需求 10 + 用户决策）：

- [ ] 打开一个 m3u8 流播放 → 右键菜单「下载 MP4」可用；右上角出现下载按钮
- [ ] 本地 mp4 播放时 → 右键「下载 MP4」禁用、无下载按钮
- [ ] 点击下载：右下角浮层出现任务，进度随播放时长推进（百分比约等于已下载/总时长）
- [ ] 未设置下载目录时文件落在系统「下载」文件夹；文件名取自流标题，重名自动加 (1)
- [ ] 下载中再点一次下载（另一 m3u8）→ 第二个任务显示「等待中」，第一个完成后自动开始
- [ ] 取消运行中任务 → 任务消失、输出半成品文件被删除（资源管理器确认）
- [ ] 下载完成 → 任务行「已完成」+「打开目录」按钮定位文件（文件可正常播放，remux 无损）
- [ ] 断网/无效源下载 → 任务失败显示错误信息、半成品被清理
- [ ] 无 duration 的任务 → 进度条为不确定滚动动画
- [ ] 右键「设置」→ 浮层打开：选择目录后生效（下一次下载落到新目录）；「恢复默认」回到系统下载目录；自动续播开关生效（重启后记忆）
- [ ] 下载进行中退出应用 → ffmpeg 进程被杀、无残留半成品（任务管理器/文件检查）
- [ ] 回归：单屏/分屏播放、收藏、列表、置顶、缩放手柄均正常；下载过程中切换视频/分屏不受影响

- [ ] **Step 3: 最终提交**（git 工作区干净，无未提交内容）

---

## 自我审查记录（Self-Review）

**Spec 覆盖：** 需求 10 + §7 全部要点 → Task 1（ffmpeg remux `-c copy`、stderr `time=` 进度）、Task 1/2（失败删半成品、无 ffmpeg 兜底 null）、Task 4/6（右键菜单 + 按钮入口、进度浮层）、Task 5/6（下载目录设置，`settings.downloadDir` 持久化）；「切换视频绝不触碰窗口」约束 → 下载链路零窗口操作（P5 全部窗口逻辑无改动）。

**占位符扫描：** 所有步骤含完整代码与命令，无 TBD/TODO；Task 2 的 before-quit 提升方案给出完整代码（含 import 调整说明）；测试代码全部可独立执行（jsdom 下 `dialog.openFolder` mock 已存在于 setup）。

**类型一致性：** `DownloadTask`（Task 1 定义）字段在 Task 2 IPC、Task 3 store、Task 4 组件、Task 6 测试中引用统一（id/itemId/title/source/outPath/status/progress/duration?/error?/createdAt）；`downloadItem` 无返回值（`Promise<void>`）在 ContextMenu/PlayerView 以 `void` 调用；`start(item, duration?)` 签名在 preload（Task 2）、store（Task 3）、mock（setup）一致；`onUpdate` 全量替换语义在 App 订阅与 store `setDownloads` 匹配；`dismiss` 仅对 done/error 生效的守卫在主进程与 UI 关闭按钮条件一致；`indeterminate` 类与 `t.duration` 判定在组件与样式匹配。
