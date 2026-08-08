import { mediaItemFromUrl } from '../../../shared/source'
import type { Playlist } from '../../../shared/types'
import { useAppStore } from './appStore'

export async function openFiles(instanceId: number): Promise<void> {
  const paths = await window.api.dialog.openFile()
  if (!paths || paths.length === 0) return
  const items = await window.api.media.fromPaths(paths)
  if (items.length === 0) return
  const playlist: Playlist = { id: crypto.randomUUID(), name: items[0].title, items, createdAt: Date.now() }
  useAppStore.getState().addPlaylist(playlist)
  useAppStore.getState().updateInstance(instanceId, { playlistId: playlist.id, currentIndex: 0, isPlaying: true })
}

export async function openFolder(instanceId: number): Promise<void> {
  const folder = await window.api.dialog.openFolder()
  if (!folder) return
  const items = await window.api.media.scanFolder(folder)
  if (items.length === 0) return
  const playlist: Playlist = { id: crypto.randomUUID(), name: items[0].title, items, createdAt: Date.now() }
  useAppStore.getState().addPlaylist(playlist)
  useAppStore.getState().updateInstance(instanceId, { playlistId: playlist.id, currentIndex: 0, isPlaying: true })
}

export function openUrl(instanceId: number, url: string): void {
  const item = mediaItemFromUrl(url.trim())
  const playlist: Playlist = { id: crypto.randomUUID(), name: item.title, items: [item], createdAt: Date.now() }
  useAppStore.getState().addPlaylist(playlist)
  useAppStore.getState().updateInstance(instanceId, { playlistId: playlist.id, currentIndex: 0, isPlaying: true })
}

export function openUrlInput(): void {
  useAppStore.getState().openUrlInput()
}
