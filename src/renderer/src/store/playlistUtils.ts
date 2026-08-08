import type { MediaItem, Playlist } from '../../../shared/types'

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

/** 列表来源标识：视频（本地文件）/ 流（网络流）/ 列表（手动创建） */
export function playlistKindLabel(p: Playlist): string {
  if (p.source === 'manual') return '列表'
  if (p.source === 'url') return '流'
  if (p.source === 'folder' || p.source === 'files') return '视频'
  const first = p.items[0]
  if (!first) return '列表'
  if (first.sourceType === 'm3u8' || first.sourceType === 'flv') return '流'
  return '视频'
}
