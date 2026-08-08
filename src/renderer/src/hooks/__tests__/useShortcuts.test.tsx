import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useAppStore } from '../../store/appStore'
import { useShortcuts } from '../useShortcuts'

function Harness(): null {
  useShortcuts()
  return null
}

describe('useShortcuts 分屏相关', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    useAppStore.setState({
      viewMode: 'single',
      activeInstance: 1,
      videoRegistry: { 0: null, 1: null, 2: null, 3: null }
    })
    ;(window.api.window.getState as jest.Mock).mockResolvedValue({
      mode: 'window',
      bounds: { x: 0, y: 0, width: 960, height: 540 },
      pinned: false
    })
    act(() => {
      root = createRoot(container)
      root.render(<Harness />)
    })
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
      root = null
      container.remove()
    })
  })

  function press(key: string): void {
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    })
  }

  it('G 键切换分屏（大小写均可）', () => {
    press('g')
    expect(useAppStore.getState().viewMode).toBe('grid')
    press('G')
    expect(useAppStore.getState().viewMode).toBe('single')
  })

  it('空格作用于活动格注册的 video（paused=true → play）', () => {
    const v = document.createElement('video')
    Object.defineProperty(v, 'paused', { configurable: true, get: () => true })
    useAppStore.setState({ videoRegistry: { 0: null, 1: v, 2: null, 3: null } })
    press(' ')
    expect(v.play).toHaveBeenCalled()
  })

  it('P 键切换置顶小窗并联动 windowMode', async () => {
    press('p')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(window.api.window.enterMini).toHaveBeenCalled()
    expect(useAppStore.getState().windowMode).toBe('mini')
  })

  it('Esc 退出置顶小窗并同步 windowMode（分屏可恢复）', async () => {
    useAppStore.setState({ windowMode: 'mini' })
    ;(window.api.window.getState as jest.Mock).mockResolvedValue({
      mode: 'mini',
      bounds: { x: 0, y: 0, width: 420, height: 280 },
      pinned: false
    })
    press('Escape')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(window.api.window.exitMini).toHaveBeenCalled()
    expect(useAppStore.getState().windowMode).toBe('window')
  })
})
