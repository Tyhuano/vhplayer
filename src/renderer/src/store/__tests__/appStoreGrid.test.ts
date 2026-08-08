import { useAppStore, flushPositions } from '../appStore'
import type { Playlist } from '../../../../shared/types'

function resetState(): void {
  useAppStore.setState({
    viewMode: 'single',
    activeInstance: 0,
    windowMode: 'window',
    pinned: false,
    videoRegistry: { 0: null, 1: null, 2: null, 3: null },
    videoSizes: { 0: null, 1: null, 2: null, 3: null },
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
    favorites: { id: 'favorites', name: '收藏', items: [], createdAt: 0 },
    settings: { downloadDir: '', autoResume: true }
  })
  ;(window.api.window.getState as jest.Mock).mockResolvedValue({
    mode: 'window',
    bounds: { x: 0, y: 0, width: 960, height: 540 },
    pinned: false
  })
  ;(window.api.window.resizeTo as jest.Mock).mockClear()
  ;(window.api.window.enterMini as jest.Mock).mockClear()
  ;(window.api.window.exitMini as jest.Mock).mockClear()
  ;(window.api.window.setPinned as jest.Mock).mockClear()
}

function makePlaylist(): Playlist {
  return { id: 'p1', name: '列表', items: [{ id: 'm1', title: '一', sourceType: 'file', value: 'C:\\a.mp4' }], createdAt: 1 }
}

describe('分屏 store actions', () => {
  beforeEach(resetState)

  it('registerVideo 注册/清空实例 video 引用', () => {
    const v = document.createElement('video')
    useAppStore.getState().registerVideo(2, v)
    expect(useAppStore.getState().videoRegistry[2]).toBe(v)
    useAppStore.getState().registerVideo(2, null)
    expect(useAppStore.getState().videoRegistry[2]).toBeNull()
  })

  it('setVideoSize 记录尺寸，传 0 清除', () => {
    useAppStore.getState().setVideoSize(0, 1920, 1080)
    expect(useAppStore.getState().videoSizes[0]).toEqual({ w: 1920, h: 1080 })
    useAppStore.getState().setVideoSize(0, 0, 0)
    expect(useAppStore.getState().videoSizes[0]).toBeNull()
  })

  it('setWindowMode 更新窗口形态', () => {
    useAppStore.getState().setWindowMode('mini')
    expect(useAppStore.getState().windowMode).toBe('mini')
  })

  it('toggleGridMode 进入分屏：按视频比例 resizeTo', async () => {
    useAppStore.getState().setVideoSize(0, 1920, 1080)
    useAppStore.getState().toggleGridMode()
    expect(useAppStore.getState().viewMode).toBe('grid')
    await new Promise((r) => setTimeout(r, 0))
    expect(window.api.window.resizeTo).toHaveBeenCalledWith(0, 0, 960, 540)
  })

  it('toggleGridMode 无视频尺寸 → 不 resize', async () => {
    useAppStore.getState().toggleGridMode()
    expect(useAppStore.getState().viewMode).toBe('grid')
    await new Promise((r) => setTimeout(r, 0))
    expect(window.api.window.resizeTo).not.toHaveBeenCalled()
  })

  it('toggleGridMode 再次调用退出分屏（不 resize）', async () => {
    useAppStore.getState().setVideoSize(0, 1920, 1080)
    useAppStore.getState().toggleGridMode()
    await new Promise((r) => setTimeout(r, 0))
    useAppStore.getState().toggleGridMode()
    expect(useAppStore.getState().viewMode).toBe('single')
    expect(window.api.window.resizeTo).toHaveBeenCalledTimes(1)
  })

  it('快速进-退分屏：已退出的过期异步回调不执行 resizeTo', async () => {
    useAppStore.getState().setVideoSize(0, 1920, 1080)
    let resolveGetState: (v: { mode: string; bounds: { x: number; y: number; width: number; height: number }; pinned: boolean }) => void
    ;(window.api.window.getState as jest.Mock).mockReturnValue(
      new Promise((r) => {
        resolveGetState = r
      })
    )
    useAppStore.getState().toggleGridMode()
    useAppStore.getState().toggleGridMode()
    expect(useAppStore.getState().viewMode).toBe('single')
    resolveGetState!({ mode: 'window', bounds: { x: 0, y: 0, width: 960, height: 540 }, pinned: false })
    await new Promise((r) => setTimeout(r, 0))
    expect(window.api.window.resizeTo).not.toHaveBeenCalled()
  })

  it('toggleMini：window→mini→window 联动 windowMode', async () => {
    await useAppStore.getState().toggleMini()
    expect(window.api.window.enterMini).toHaveBeenCalled()
    expect(useAppStore.getState().windowMode).toBe('mini')
    await useAppStore.getState().toggleMini()
    expect(window.api.window.exitMini).toHaveBeenCalled()
    expect(useAppStore.getState().windowMode).toBe('window')
  })

  it('togglePinned：切换 setPinned 并同步状态', async () => {
    await useAppStore.getState().togglePinned()
    expect(window.api.window.setPinned).toHaveBeenCalledWith(true)
    expect(useAppStore.getState().pinned).toBe(true)
    await useAppStore.getState().togglePinned()
    expect(window.api.window.setPinned).toHaveBeenCalledWith(false)
    expect(useAppStore.getState().pinned).toBe(false)
  })

  it('flushPositions 从 videoRegistry 读取各实例视频当前时间', () => {
    useAppStore.setState({ playlists: [makePlaylist()] })
    useAppStore.getState().updateInstance(0, { playlistId: 'p1', currentIndex: 0 })
    const v = document.createElement('video')
    Object.defineProperty(v, 'currentTime', { configurable: true, get: () => 42, set: () => {} })
    useAppStore.getState().registerVideo(0, v)
    flushPositions()
    expect(useAppStore.getState().playlists[0].items[0].lastPosition).toBe(42)
  })

  it('syncWindowStateFromMain 从主进程同步窗口形态与置顶', async () => {
    ;(window.api.window.getState as jest.Mock).mockResolvedValue({
      mode: 'mini',
      bounds: { x: 0, y: 0, width: 420, height: 280 },
      pinned: true
    })
    await useAppStore.getState().syncWindowStateFromMain()
    expect(useAppStore.getState().windowMode).toBe('mini')
    expect(useAppStore.getState().pinned).toBe(true)
  })
})
