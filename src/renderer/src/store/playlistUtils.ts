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
