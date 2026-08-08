import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import PlayerView from '../PlayerView'
import { useAppStore } from '../../store/appStore'
import type { StoreSnapshot } from '../../../../shared/types'

function makeSnapshot(lastPosition?: number, autoResume = true): StoreSnapshot {
  const item = { id: 'm1', title: '测试', sourceType: 'file' as const, value: 'C:\\v\\a.mp4', lastPosition }
  return {
    playlists: [{ id: 'p1', name: '列表', items: [item], createdAt: 1 }],
    favorites: { id: 'favorites', name: '收藏', items: [], createdAt: 0 },
    settings: { downloadDir: '', autoResume },
    instances: [0, 1, 2, 3].map((id) => ({
      id,
      playlistId: id === 0 ? 'p1' : null,
      currentIndex: 0,
      playMode: 'order' as const,
      isPlaying: false,
      volume: 1,
      rate: 1,
      scaleMode: 'contain' as const
    }))
  }
}

describe('PlayerView 记忆续播', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    act(() => {
      container.remove()
    })
  })

  function controllableCurrentTime(video: HTMLVideoElement): void {
    let value = 0
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => value,
      set: (v: number) => {
        value = v
      }
    })
  }

  it('hydrate 后加载视频，loadedmetadata 时 seek 到 lastPosition', async () => {
    act(() => {
      useAppStore.setState({
        playlists: [],
        instances: [0, 1, 2, 3].map((id) => ({
          id,
          playlistId: null,
          currentIndex: 0,
          playMode: 'order' as const,
          isPlaying: false,
          volume: 1,
          rate: 1,
          scaleMode: 'contain' as const
        }))
      })
    })
    await act(async () => {
      createRoot(container).render(<PlayerView instanceId={0} />)
    })
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video).not.toBeNull()
    controllableCurrentTime(video)

    await act(async () => {
      useAppStore.getState().hydrate(makeSnapshot(30))
    })

    expect(video.src).toBe('vh://local/C:/v/a.mp4')
    Object.defineProperty(video, 'duration', { configurable: true, get: () => 100 })
    await act(async () => {
      video.dispatchEvent(new Event('loadedmetadata'))
    })
    expect(video.currentTime).toBe(30)
  })

  it('autoResume 关闭时不恢复位置', async () => {
    act(() => {
      useAppStore.setState({
        playlists: [],
        instances: [0, 1, 2, 3].map((id) => ({
          id,
          playlistId: null,
          currentIndex: 0,
          playMode: 'order' as const,
          isPlaying: false,
          volume: 1,
          rate: 1,
          scaleMode: 'contain' as const
        }))
      })
    })
    await act(async () => {
      createRoot(container).render(<PlayerView instanceId={0} />)
    })
    const video = container.querySelector('video') as HTMLVideoElement
    controllableCurrentTime(video)

    await act(async () => {
      useAppStore.getState().hydrate(makeSnapshot(30, false))
    })
    Object.defineProperty(video, 'duration', { configurable: true, get: () => 100 })
    await act(async () => {
      video.dispatchEvent(new Event('loadedmetadata'))
    })
    expect(video.currentTime).toBe(0)
  })
})
