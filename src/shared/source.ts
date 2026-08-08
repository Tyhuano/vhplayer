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
