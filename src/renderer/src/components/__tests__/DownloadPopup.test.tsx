import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import DownloadPopup from '../DownloadPopup'
import { useAppStore } from '../../store/appStore'
import type { DownloadTask } from '../../../../shared/types'

function task(partial: Partial<DownloadTask>): DownloadTask {
  return {
    id: 't1',
    itemId: 'm1',
    title: '测试流',
    source: 'https://a.com/1.m3u8',
    outPath: 'C:\\dl\\测试流.mp4',
    status: 'running',
    progress: 0,
    createdAt: 1,
    ...partial
  }
}

describe('DownloadPopup', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    useAppStore.setState({ downloads: [], downloadNotice: null })
    ;(window.api.download.cancel as jest.Mock).mockClear()
    ;(window.api.download.dismiss as jest.Mock).mockClear()
    ;(window.api.download.showInFolder as jest.Mock).mockClear()
    act(() => {
      root = createRoot(container)
      root.render(<DownloadPopup />)
    })
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
      root = null
      container.remove()
    })
  })

  it('无任务且无 notice → 不渲染', () => {
    expect(container.innerHTML).toBe('')
  })

  it('渲染任务行：标题 + 进度条 + 状态文案', () => {
    act(() => {
      useAppStore.setState({ downloads: [task({ status: 'running', progress: 0.5 })] })
    })
    const el = container.querySelector('.download-popup') as HTMLElement
    expect(el).toBeTruthy()
    expect(el.textContent).toContain('测试流')
    expect(el.textContent).toContain('50%')
    expect(container.querySelector('.download-progress-fill') as HTMLElement).toBeTruthy()
  })

  it('running 任务显示取消按钮 → cancelDownload', () => {
    act(() => {
      useAppStore.setState({ downloads: [task({})] })
    })
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.title === '取消') as HTMLElement
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(window.api.download.cancel).toHaveBeenCalledWith('t1')
  })

  it('queued 任务文案为等待中', () => {
    act(() => {
      useAppStore.setState({ downloads: [task({ status: 'queued', progress: 0 })] })
    })
    expect(container.querySelector('.download-popup')?.textContent).toContain('等待中')
  })

  it('done 任务：显示完成 + 打开目录按钮 + 移除按钮', () => {
    act(() => {
      useAppStore.setState({ downloads: [task({ status: 'done', progress: 1 })] })
    })
    expect(container.querySelector('.download-popup')?.textContent).toContain('已完成')
    const open = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('打开目录')) as HTMLElement
    act(() => {
      open.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(window.api.download.showInFolder).toHaveBeenCalledWith('t1')
    const close = Array.from(container.querySelectorAll('button')).find((b) => b.title === '移除') as HTMLElement
    act(() => {
      close.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(window.api.download.dismiss).toHaveBeenCalledWith('t1')
  })

  it('error 任务：显示错误信息', () => {
    act(() => {
      useAppStore.setState({ downloads: [task({ status: 'error', error: 'Connection reset' })] })
    })
    expect(container.querySelector('.download-popup')?.textContent).toContain('失败')
    expect(container.querySelector('.download-popup')?.textContent).toContain('Connection reset')
  })

  it('downloadNotice 显示提示条', () => {
    act(() => {
      useAppStore.setState({ downloadNotice: '未找到 ffmpeg，无法下载' })
    })
    expect(container.querySelector('.download-popup')?.textContent).toContain('未找到 ffmpeg')
  })
})
