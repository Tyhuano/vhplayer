import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ContextMenu, { clampMenuPosition } from '../ContextMenu'
import { useAppStore } from '../../store/appStore'
import type { Playlist } from '../../../../shared/types'

function p1(): Playlist {
  return {
    id: 'p1',
    name: '列表',
    items: [
      { id: 'm1', title: '一', sourceType: 'file', value: 'C:\\a.mp4' },
      { id: 'm2', title: '二', sourceType: 'file', value: 'C:\\b.mp4' }
    ],
    createdAt: 1
  }
}

describe('clampMenuPosition', () => {
  it('不越界时保持原位置', () => {
    expect(clampMenuPosition(100, 60, 200, 300, 1024, 768)).toEqual({ x: 100, y: 60 })
  })

  it('右边缘不足时向左翻转', () => {
    expect(clampMenuPosition(900, 60, 200, 300, 1024, 768)).toEqual({ x: 820, y: 60 })
  })

  it('下边缘不足时向上翻转', () => {
    expect(clampMenuPosition(100, 700, 200, 300, 1024, 768)).toEqual({ x: 100, y: 464 })
  })
})

describe('ContextMenu', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    useAppStore.setState({
      menuOpen: true,
      menuX: 100,
      menuY: 60,
      playlists: [p1()],
      favorites: { id: 'favorites', name: '收藏', items: [], createdAt: 0 },
      instances: [0, 1, 2, 3].map((id) => ({
        id,
        playlistId: id === 0 ? 'p1' : null,
        currentIndex: 0,
        playMode: 'order' as const,
        isPlaying: true,
        volume: 1,
        rate: 1,
        scaleMode: 'contain' as const
      }))
    })
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
      root = null
      container.remove()
    })
  })

  function renderMenu(): void {
    act(() => {
      root = createRoot(container)
      root.render(<ContextMenu />)
    })
  }

  function menuEl(): HTMLElement | null {
    return container.querySelector('.context-menu')
  }

  it('打开时渲染菜单与基础项（播放/暂停随 isPlaying）', () => {
    renderMenu()
    expect(menuEl()).not.toBeNull()
    const labels = Array.from(container.querySelectorAll('.menu-label')).map((e) => e.textContent)
    expect(labels).toContain('暂停')
    expect(labels).toContain('播放模式')
    expect(labels).toContain('倍速')
    expect(labels).toContain('画面缩放')
    expect(labels).toContain('收藏')
    expect(labels).toContain('下载 MP4')
  })

  it('置灰项不可点击（点击后菜单不关闭、无副作用）', () => {
    renderMenu()
    const item = Array.from(container.querySelectorAll('.menu-item')).find(
      (e) => e.textContent?.includes('下载 MP4')
    ) as HTMLElement
    expect(item.classList.contains('disabled')).toBe(true)
    act(() => {
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().menuOpen).toBe(true)
  })

  it('点击下一集：currentIndex 更新且菜单关闭', () => {
    renderMenu()
    const item = Array.from(container.querySelectorAll('.menu-item')).find(
      (e) => e.textContent?.includes('下一集')
    ) as HTMLElement
    act(() => {
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().instances[0].currentIndex).toBe(1)
    expect(useAppStore.getState().menuOpen).toBe(false)
  })

  it('点击外部（mousedown）关闭菜单', () => {
    renderMenu()
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(useAppStore.getState().menuOpen).toBe(false)
  })

  it('Esc 关闭菜单', () => {
    renderMenu()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(useAppStore.getState().menuOpen).toBe(false)
  })

  it('播放/暂停项操作 video（paused=true 时调用 play）', () => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'paused', { configurable: true, get: () => true })
    video.className = 'player-video'
    const wrapper = document.createElement('div')
    wrapper.className = 'player-view'
    wrapper.appendChild(video)
    document.body.appendChild(wrapper)
    renderMenu()
    const item = Array.from(container.querySelectorAll('.menu-item')).find(
      (e) => e.textContent?.includes('暂停')
    ) as HTMLElement
    act(() => {
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(video.play).toHaveBeenCalled()
    wrapper.remove()
  })

  it('右/下边缘不足时菜单位置翻转（clamp）', () => {
    const rectSpy = jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        width: 200,
        height: 300,
        top: 0,
        left: 0,
        right: 200,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({})
      } as DOMRect)
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 300 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 })
    useAppStore.setState({ menuX: 250, menuY: 350 })
    renderMenu()
    const el = menuEl()
    expect(el?.style.left).toBe('96px')
    expect(el?.style.top).toBe('96px')
    rectSpy.mockRestore()
  })
})
