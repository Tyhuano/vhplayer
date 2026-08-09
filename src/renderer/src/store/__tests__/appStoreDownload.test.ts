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
