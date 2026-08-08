import { mediaItemFromUrl } from '../../../shared/source'
import type { Playlist } from '../../../shared/types'
import { useAppStore } from './appStore'

export async function openFiles(instanceId: number): Promise<void> {
  const paths = await window.api.dialog.openFile()
  if (!paths || paths.length === 0) return
  const items = await window.api.media.fromPaths(paths)
  if (items.length === 0) return
  const playlist: Playlist = { id: crypto.randomUUID(), name: items[0].title, items, createdAt: Date.now(), source: 'files' }
  useAppStore.getState().addPlaylist(playlist)
  useAppStore.getState().updateInstance(instanceId, { playlistId: playlist.id, currentIndex: 0, isPlaying: true })
}

export async function openFolder(instanceId: number): Promise<void> {
  const folder = await window.api.dialog.openFolder()
  if (!folder) return
  const items = await window.api.media.scanFolder(folder)
  if (items.length === 0) return
  // 列表名默认取文件夹名（可后续重命名）
  const folderName = folder.split(/[\\/]/).filter(Boolean).pop() ?? items[0].title
  const playlist: Playlist = {
    id: crypto.randomUUID(),
    name: folderName,
    items,
    createdAt: Date.now(),
    source: 'folder'
  }
  useAppStore.getState().addPlaylist(playlist)
  useAppStore.getState().updateInstance(instanceId, { playlistId: playlist.id, currentIndex: 0, isPlaying: true })
}

export function openUrl(instanceId: number, url: string): void {
  const item = mediaItemFromUrl(url.trim())
  const playlist: Playlist = {
    id: crypto.randomUUID(),
    name: item.title,
    items: [item],
    createdAt: Date.now(),
    source: 'url'
  }
  useAppStore.getState().addPlaylist(playlist)
  useAppStore.getState().updateInstance(instanceId, { playlistId: playlist.id, currentIndex: 0, isPlaying: true })
}

/** 选择本地文件加入指定列表（引用快照：仅存路径与元信息，不复制文件） */
export async function pickFilesToAdd(playlistId: string): Promise<void> {
  const paths = await window.api.dialog.openFile()
  if (!paths || paths.length === 0) return
  const items = await window.api.media.fromPaths(paths)
  if (items.length === 0) return
  useAppStore.getState().addItemsToPlaylist(playlistId, items)
}

/** 网络流/直链加入指定列表 */
export function addUrlToPlaylist(playlistId: string, url: string): void {
  const item = mediaItemFromUrl(url.trim())
  useAppStore.getState().addItemsToPlaylist(playlistId, [item])
}

export function openUrlInput(): void {
  useAppStore.getState().openUrlInput()
}
