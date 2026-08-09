import { app } from 'electron'
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface AppEnv {
  isPackaged: boolean
  execPath: string
  userDataPath: string
}

function realEnv(): AppEnv {
  return { isPackaged: app.isPackaged, execPath: process.execPath, userDataPath: app.getPath('userData') }
}

/** 探测目录是否真实可写（创建 + 写探针文件），避免 Program Files 只读目录假成功 */
function probeWritable(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.probe-${process.pid}`)
    writeFileSync(probe, 'x')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

function exeDirOf(env: AppEnv): string {
  return dirname(env.execPath)
}

/**
 * 应用数据目录（播放列表/收藏/设置持久化）：
 * 打包版优先用安装目录旁 data/（跟着程序走，非必要不占用 C 盘用户目录）；
 * 安装目录不可写（如 Program Files）或开发模式时回退 Electron userData。
 */
export function resolveDataDir(env: AppEnv = realEnv()): string {
  if (env.isPackaged) {
    const dataDir = join(exeDirOf(env), 'data')
    if (probeWritable(dataDir)) return dataDir
  }
  return env.userDataPath
}

/**
 * Chromium 会话缓存目录（Cache/GPUCache/Local Storage 等）：
 * 打包版优先安装目录旁 cache/；不可写或开发模式返回 null（保持默认）。
 */
export function resolveCacheDir(env: AppEnv = realEnv()): string | null {
  if (!env.isPackaged) return null
  const cacheDir = join(exeDirOf(env), 'cache')
  return probeWritable(cacheDir) ? cacheDir : null
}
