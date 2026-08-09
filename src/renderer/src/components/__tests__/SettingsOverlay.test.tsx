import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import SettingsOverlay from '../SettingsOverlay'
import { useAppStore } from '../../store/appStore'

describe('SettingsOverlay', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    useAppStore.setState({ settingsOpen: false, settings: { downloadDir: '', autoResume: true } })
    ;(window.api.dialog.openFolder as jest.Mock).mockClear()
    act(() => {
      root = createRoot(container)
      root.render(<SettingsOverlay />)
    })
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
      root = null
      container.remove()
    })
  })

  it('settingsOpen=false 不渲染', () => {
    expect(container.innerHTML).toBe('')
  })

  it('打开时显示下载目录（未配置显示默认文案）与自动续播开关', () => {
    act(() => {
      useAppStore.setState({ settingsOpen: true })
    })
    expect(container.querySelector('.settings-overlay')?.textContent).toContain('系统下载目录')
    expect(container.querySelector('.settings-overlay')?.textContent).toContain('自动续播')
  })

  it('选择目录：openFolder 后写入 settings.downloadDir', async () => {
    act(() => {
      useAppStore.setState({ settingsOpen: true })
    })
    ;(window.api.dialog.openFolder as jest.Mock).mockResolvedValue('D:\\视频下载')
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('选择目录')) as HTMLElement
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(window.api.dialog.openFolder).toHaveBeenCalled()
    expect(useAppStore.getState().settings.downloadDir).toBe('D:\\视频下载')
  })

  it('恢复默认：清空 downloadDir', () => {
    act(() => {
      useAppStore.setState({ settingsOpen: true, settings: { downloadDir: 'D:\\dl', autoResume: true } })
    })
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('恢复默认')) as HTMLElement
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().settings.downloadDir).toBe('')
  })

  it('自动续播开关切换', () => {
    act(() => {
      useAppStore.setState({ settingsOpen: true })
    })
    const box = container.querySelector('.settings-checkbox input') as HTMLInputElement
    act(() => {
      box.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().settings.autoResume).toBe(false)
  })

  it('Esc 关闭浮层', () => {
    act(() => {
      useAppStore.setState({ settingsOpen: true })
    })
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(useAppStore.getState().settingsOpen).toBe(false)
  })

  it('点遮罩关闭', () => {
    act(() => {
      useAppStore.setState({ settingsOpen: true })
    })
    const mask = container.querySelector('.settings-mask') as HTMLElement
    act(() => {
      mask.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().settingsOpen).toBe(false)
  })
})
