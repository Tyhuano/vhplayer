import { PlayerCore } from '../playerCore'
import type { MediaItem } from '../../../../shared/types'

jest.mock('hls.js', () => {
  interface HlsInstanceMock {
    attachMedia: jest.Mock
    loadSource: jest.Mock
    destroy: jest.Mock
    on: jest.Mock
    off: jest.Mock
    config: Record<string, unknown>
  }
  const instances: HlsInstanceMock[] = []
  const HlsMock = jest.fn().mockImplementation(() => {
    const inst: HlsInstanceMock = {
      attachMedia: jest.fn(),
      loadSource: jest.fn(),
      destroy: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      config: {}
    }
    instances.push(inst)
    return inst
  }) as unknown as jest.Mock & {
    isSupported: jest.Mock
    Events: { ERROR: string }
    __instances: HlsInstanceMock[]
  }
  HlsMock.isSupported = jest.fn(() => true)
  HlsMock.Events = { ERROR: 'hlsError' }
  HlsMock.__instances = instances
  return { __esModule: true, default: HlsMock }
})

jest.mock('flv.js', () => ({
  __esModule: true,
  default: {
    isSupported: jest.fn(() => true),
    Events: { ERROR: 'flvError' },
    createPlayer: jest.fn(() => ({
      attachMediaElement: jest.fn(),
      load: jest.fn(),
      play: jest.fn(),
      destroy: jest.fn(),
      on: jest.fn()
    }))
  }
}))

import Hls from 'hls.js'
import flvjs from 'flv.js'

type HlsMockType = typeof Hls & { __instances: Array<{ attachMedia: jest.Mock; loadSource: jest.Mock; destroy: jest.Mock; on: jest.Mock; off: jest.Mock; config: Record<string, unknown> }> }
const hlsInstances = (Hls as unknown as HlsMockType).__instances

function makeItem(partial: Partial<MediaItem> = {}): MediaItem {
  return { id: 'm1', title: '测试', sourceType: 'file', value: 'C:\\v\\a.mp4', ...partial }
}

function createVideo(): HTMLVideoElement {
  const video = document.createElement('video')
  Object.defineProperty(video, 'videoWidth', { configurable: true, get: () => 1280 })
  Object.defineProperty(video, 'videoHeight', { configurable: true, get: () => 720 })
  Object.defineProperty(video, 'duration', { configurable: true, get: () => 100 })
  Object.defineProperty(video, 'paused', { configurable: true, get: () => false })
  return video
}

function fire(video: HTMLVideoElement, event: string): void {
  video.dispatchEvent(new Event(event))
}

describe('PlayerCore', () => {
  let video: HTMLVideoElement

  beforeEach(() => {
    video = createVideo()
    jest.clearAllMocks()
    hlsInstances.length = 0
  })

  it('m3u8 源创建 Hls 实例并 attachMedia/loadSource', async () => {
    const core = new PlayerCore(video)
    await core.load(makeItem({ sourceType: 'm3u8', value: 'https://x.com/live.m3u8' }))
    expect(Hls).toHaveBeenCalledTimes(1)
    const hls = hlsInstances[0]
    expect(hls.attachMedia).toHaveBeenCalledWith(video)
    expect(hls.loadSource).toHaveBeenCalledWith('https://x.com/live.m3u8')
    core.destroy()
  })

  it('flv 源创建 flv player 并 attachMediaElement/load/play', async () => {
    const core = new PlayerCore(video)
    await core.load(makeItem({ sourceType: 'flv', value: 'https://x.com/live.flv' }))
    expect(flvjs.createPlayer).toHaveBeenCalledWith({ type: 'flv', url: 'https://x.com/live.flv', isLive: false })
    const player = (flvjs.createPlayer as unknown as jest.Mock).mock.results[0].value
    expect(player.attachMediaElement).toHaveBeenCalledWith(video)
    expect(player.load).toHaveBeenCalled()
    expect(player.play).toHaveBeenCalled()
    core.destroy()
  })

  it('本地文件源直接设置 file:// src，不创建任何引擎', async () => {
    const core = new PlayerCore(video)
    await core.load(makeItem({ sourceType: 'file', value: 'C:\\v\\a.mp4' }))
    expect(video.src).toBe('file:///C:/v/a.mp4')
    expect(Hls).not.toHaveBeenCalled()
    expect(flvjs.createPlayer).not.toHaveBeenCalled()
    core.destroy()
  })

  it('http 直链直接设置 src', async () => {
    const core = new PlayerCore(video)
    await core.load(makeItem({ sourceType: 'url', value: 'https://x.com/v.mp4' }))
    expect(video.src).toBe('https://x.com/v.mp4')
    core.destroy()
  })

  it('重复 load 会销毁上一个引擎（防内存泄漏）', async () => {
    const core = new PlayerCore(video)
    await core.load(makeItem({ sourceType: 'm3u8', value: 'https://x.com/a.m3u8' }))
    const first = hlsInstances[0]
    await core.load(makeItem({ sourceType: 'm3u8', value: 'https://x.com/b.m3u8' }))
    expect(first.destroy).toHaveBeenCalledTimes(1)
    const second = hlsInstances[1]
    expect(second).not.toBe(first)
    core.destroy()
  })

  it('destroy 释放引擎、清空 src 并移除监听', async () => {
    const core = new PlayerCore(video)
    await core.load(makeItem({ sourceType: 'm3u8', value: 'https://x.com/a.m3u8' }))
    const hls = hlsInstances[0]
    core.destroy()
    expect(hls.destroy).toHaveBeenCalledTimes(1)
    expect(video.hasAttribute('src')).toBe(false)
  })

  it('hls 致命错误触发 onError 并销毁引擎', async () => {
    const onError = jest.fn()
    const core = new PlayerCore(video, { onError })
    await core.load(makeItem({ sourceType: 'm3u8', value: 'https://x.com/a.m3u8' }))
    const hls = hlsInstances[0]
    const errorHandler = hls.on.mock.calls.find(([evt]: [string]) => evt === 'hlsError')[1]
    errorHandler('hlsError', { fatal: true, details: 'networkError' })
    expect(onError).toHaveBeenCalledWith('fatal', 'networkError')
    expect(hls.destroy).toHaveBeenCalled()
    core.destroy()
  })

  it('video 原生 error 事件映射为错误回调', () => {
    const onError = jest.fn()
    const core = new PlayerCore(video, { onError })
    fire(video, 'error')
    expect(onError).toHaveBeenCalledWith('network', 'video error 0')
    core.destroy()
  })

  it('timeupdate 事件转发当前时间', () => {
    const onTimeUpdate = jest.fn()
    const core = new PlayerCore(video, { onTimeUpdate })
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 42 })
    fire(video, 'timeupdate')
    expect(onTimeUpdate).toHaveBeenCalledWith(42)
    core.destroy()
  })

  it('控制方法透传 video：play/pause/togglePlay/seek/volume/rate', () => {
    const core = new PlayerCore(video)
    core.play()
    expect(video.play).toHaveBeenCalled()
    core.pause()
    expect(video.pause).toHaveBeenCalled()
    core.togglePlay()
    core.seek(30)
    core.setVolume(0.5)
    expect(video.volume).toBe(0.5)
    core.setMuted(true)
    expect(video.muted).toBe(true)
    core.setRate(1.5)
    expect(video.playbackRate).toBe(1.5)
    core.destroy()
  })
})
