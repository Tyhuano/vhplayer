import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { MediaItem } from '../shared/types'
import { guessSourceType, titleFromPath, uid } from '../shared/source'

const SUPPORTED_EXTENSIONS = new Set(['.mp4', '.webm', '.ogv', '.mov', '.mkv', '.m3u8', '.flv'])

async function toMediaItem(path: string): Promise<MediaItem> {
  let createdAt = Date.now()
  try {
    createdAt = (await stat(path)).mtimeMs
  } catch {
    // 文件不存在或不可读时回退当前时间
  }
  return { id: uid(), title: titleFromPath(path), sourceType: guessSourceType(path), value: path, createdAt }
}

export async function scanMediaFolder(folder: string): Promise<MediaItem[]> {
  try {
    const entries = await readdir(folder, { withFileTypes: true })
    const paths = entries
      .filter((e) => e.isFile() && SUPPORTED_EXTENSIONS.has(extname(e.name).toLowerCase()))
      .map((e) => join(folder, e.name))
    const items = await Promise.all(paths.map(toMediaItem))
    // 文件夹列表按文件修改时间升序排列（旧→新），作为播放顺序
    return items.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
  } catch {
    return []
  }
}

export async function mediaItemsFromPaths(paths: string[]): Promise<MediaItem[]> {
  return Promise.all(paths.map(toMediaItem))
}
