import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../../App'
import { useAppStore } from '../../store/appStore'
import type { StoreSnapshot } from '../../../../shared/types'

function snapshot(): StoreSnapshot {
  const instances = [0, 1, 2, 3].map((id) => ({
    id,
    playlistId: null,
    currentIndex: 0,
    playMode: 'order' as const,
    isPlaying: false,
    volume: 1,
    rate: 1,
    scaleMode: 'contain' as const
  }))
  return {
    playlists: [],
    favorites: { id: 'favorites', name: '收藏', items: [], createdAt: 0 },
    settings: { downloadDir: '', autoResume: true },
    instances
  }
}

describe('App 分屏渲染', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    ;(window.api.store.getAll as jest.Mock).mockResolvedValue(snapshot())
    ;(window.api.window.getState as jest.Mock).mockResolvedValue({
      mode: 'window',
      bounds: { x: 0, y: 0, width: 960, height: 540 },
      pinned: false
    })
    useAppStore.setState({
      viewMode: 'single',
      windowMode: 'window',
      activeInstance: 0,
      videoRegistry: { 0: null, 1: null, 2: null, 3: null },
      videoSizes: { 0: null, 1: null, 2: null, 3: null }
    })
    await act(async () => {
      root = createRoot(container)
      root.render(<App />)
      await new Promise((r) => setTimeout(r, 0))
    })
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
      root = null
      container.remove()
    })
  })

  it('single 模式渲染 1 个 .player-view', () => {
    expect(container.querySelectorAll('.player-view')).toHaveLength(1)
  })

  it('grid 模式渲染 4 个 .player-view', () => {
    act(() => {
      useAppStore.setState({ viewMode: 'grid' })
    })
    expect(container.querySelectorAll('.player-view')).toHaveLength(4)
  })

  it('分屏网格保持视频平均宽高比（contain 结构，不随窗口比例错位）', () => {
    act(() => {
      useAppStore.setState({
        viewMode: 'grid',
        videoSizes: { 0: { w: 1920, h: 1080 }, 1: null, 2: null, 3: null }
      })
    })
    expect(container.querySelector('.player-grid-wrap')).not.toBeNull()
    const grid = container.querySelector('.player-grid') as HTMLElement
    expect(grid).not.toBeNull()
    expect(grid.style.aspectRatio).toBe(String(16 / 9))
    // calc(100vh * R) 会被 CSSOM 化简为 vh 数值，断言其 contain 结构即可
    expect(grid.style.width).toContain('min(100%')
    expect(grid.style.width).toContain('vh')
  })

  it('mini + grid → 渲染活动格单格', () => {
    act(() => {
      useAppStore.setState({ viewMode: 'grid', windowMode: 'mini' })
    })
    expect(container.querySelectorAll('.player-view')).toHaveLength(1)
  })

  it('点击格子切换活动格并施加 active 类', () => {
    act(() => {
      useAppStore.setState({ viewMode: 'grid' })
    })
    const views = container.querySelectorAll('.player-view')
    expect(views[0].classList.contains('active')).toBe(true)
    act(() => {
      views[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().activeInstance).toBe(1)
    expect(views[1].classList.contains('active')).toBe(true)
  })

  it('窗口小于 480x320 时施加 compact 类（仅保留播放区域）', () => {
    const origW = window.innerWidth
    const origH = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(container.querySelector('.app')?.classList.contains('compact')).toBe(true)
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: origW })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: origH })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(container.querySelector('.app')?.classList.contains('compact')).toBe(false)
  })

  it('mini 模式下窗口小但不施加 compact（保留控制列）', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 420 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 280 })
    act(() => {
      useAppStore.setState({ windowMode: 'mini' })
      window.dispatchEvent(new Event('resize'))
    })
    expect(container.querySelector('.app')?.classList.contains('compact')).toBe(false)
  })

  it('urlInputOpen 时渲染网络流浮层，确认后作用于活动格', () => {
    act(() => {
      useAppStore.setState({ activeInstance: 0, urlInputOpen: true })
    })
    const overlay = container.querySelector('.url-overlay')
    expect(overlay).not.toBeNull()
    const input = container.querySelector('.url-input') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    act(() => {
      setter?.call(input, 'https://example.com/live.m3u8')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      const play = Array.from(container.querySelectorAll('.url-actions button')).find(
        (b) => b.textContent?.includes('播放')
      ) as HTMLElement
      play.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const state = useAppStore.getState()
    expect(state.urlInputOpen).toBe(false)
    expect(state.playlists).toHaveLength(1)
    expect(state.instances[0].playlistId).toBe(state.playlists[0].id)
  })
})
