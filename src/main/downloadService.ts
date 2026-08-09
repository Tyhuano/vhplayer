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

/** asar 打包后二进制无法直接 spawn：把 app.asar 路径重定向到 app.asar.unpacked */
export function asarUnpackPath(p: string): string {
  if (!p.includes('app.asar') || p.includes('app.asar.unpacked')) return p
  return p.replace('app.asar', 'app.asar.unpacked')
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
    const rawPath = opts.ffmpegPath === undefined ? ((require('ffmpeg-static') as string) ?? null) : opts.ffmpegPath
    this.ffmpegPath = rawPath ? asarUnpackPath(rawPath) : null
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

  /** 取消：running kill 子进程并从列表移除（close 后删半成品）；queued 直接移除 */
  cancel(taskId: string): void {
    if (this.active?.id === taskId) {
      const idx = this.tasks.findIndex((t) => t.id === taskId)
      if (idx >= 0) {
        this.tasks.splice(idx, 1)
        this.emit()
      }
      this.child?.kill()
      return
    }
    const idx = this.tasks.findIndex((t) => t.id === taskId)
    if (idx >= 0) {
      this.tasks.splice(idx, 1)
      this.emit()
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
    let errorBuf = ''
    let lastTime = 0
    child.stderr.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      errorBuf += chunk.toString('utf8')
      if (errorBuf.length > 2000) errorBuf = errorBuf.slice(-2000)
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const t = parseTimeFromLine(line)
        if (t !== null) lastTime = t
      }
      if (buffer.trim()) {
        const t = parseTimeFromLine(buffer)
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
        task.error = errorBuf.trim().slice(-200)
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
