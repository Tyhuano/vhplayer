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
        return { id: uid(), title: titleFromPath(path), sourceType: guessSourceType(path), value: path, createdAt: Date.now() }
      })
  } catch {
    return []
  }
}
