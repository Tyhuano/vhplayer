import type { MediaItem } from '../../../shared/types'
import { toFileUrl } from '../../../shared/source'

export type PlayerErrorKind = 'network' | 'unsupported' | 'fatal'

export interface PlayerCoreEvents {
  onTimeUpdate?: (currentTime: number) => void
  onDuration?: (duration: number) => void
  onPlaying?: () => void
  onPaused?: () => void
  onEnded?: () => void
  onError?: (kind: PlayerErrorKind, message: string) => void
  onLoadedMetadata?: (videoWidth: number, videoHeight: number, duration: number) => void
}

type HlsCtor = typeof import('hls.js').default
type FlvNamespace = typeof import('flv.js').default

let hlsPromise: Promise<HlsCtor> | null = null
let flvPromise: Promise<FlvNamespace> | null = null

function loadHlsModule(): Promise<HlsCtor> {
  if (!hlsPromise) hlsPromise = import('hls.js').then((m) => m.default)
  return hlsPromise
}

function loadFlvModule(): Promise<FlvNamespace> {
  if (!flvPromise) flvPromise = import('flv.js').then((m) => m.default)
  return flvPromise
}

export class PlayerCore {
  private hls: InstanceType<HlsCtor> | null = null
  private flv: ReturnType<FlvNamespace['createPlayer']> | null = null

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly events: PlayerCoreEvents = {}
  ) {
    this.video.addEventListener('timeupdate', this.handleTimeUpdate)
    this.video.addEventListener('durationchange', this.handleDurationChange)
    this.video.addEventListener('play', this.handlePlay)
    this.video.addEventListener('pause', this.handlePause)
    this.video.addEventListener('ended', this.handleEnded)
    this.video.addEventListener('error', this.handleVideoError)
    this.video.addEventListener('loadedmetadata', this.handleLoadedMetadata)
  }

  async load(item: MediaItem): Promise<void> {
    this.disposeEngine()
    if (item.sourceType === 'm3u8') {
      const Hls = await loadHlsModule()
      if (Hls.isSupported()) {
        this.loadHls(Hls, item.value)
        return
      }
    } else if (item.sourceType === 'flv') {
      const flvjs = await loadFlvModule()
      if (flvjs.isSupported()) {
        this.loadFlv(flvjs, item.value)
        return
      }
    }
    this.video.src = item.sourceType === 'file' ? toFileUrl(item.value) : item.value
    this.video.load()
  }

  private loadHls(Hls: HlsCtor, url: string): void {
    const hls = new Hls()
    this.hls = hls
    hls.on(Hls.Events.ERROR, (_event, data) => {
      const fatal = Boolean(data.fatal)
      if (fatal) this.disposeEngine()
      this.events.onError?.(fatal ? 'fatal' : 'network', String(data.details ?? 'hls error'))
    })
    hls.loadSource(url)
    hls.attachMedia(this.video)
  }

  private loadFlv(flvjs: FlvNamespace, url: string): void {
    const flv = flvjs.createPlayer({ type: 'flv', url, isLive: false })
    this.flv = flv
    flv.on(flvjs.Events.ERROR, (_type, detail) => {
      this.events.onError?.('fatal', String(detail ?? 'flv error'))
    })
    flv.attachMediaElement(this.video)
    flv.load()
    flv.play()
  }

  play(): void {
    this.video.play()?.catch(() => {})
  }

  pause(): void {
    this.video.pause()
  }

  togglePlay(): void {
    if (this.video.paused) this.play()
    else this.pause()
  }

  seek(time: number): void {
    this.video.currentTime = time
  }

  setVolume(volume: number): void {
    this.video.volume = Math.min(1, Math.max(0, volume))
  }

  setMuted(muted: boolean): void {
    this.video.muted = muted
  }

  setRate(rate: number): void {
    this.video.playbackRate = rate
  }

  getDuration(): number {
    return Number.isFinite(this.video.duration) ? this.video.duration : 0
  }

  destroy(): void {
    this.disposeEngine()
    this.video.removeEventListener('timeupdate', this.handleTimeUpdate)
    this.video.removeEventListener('durationchange', this.handleDurationChange)
    this.video.removeEventListener('play', this.handlePlay)
    this.video.removeEventListener('pause', this.handlePause)
    this.video.removeEventListener('ended', this.handleEnded)
    this.video.removeEventListener('error', this.handleVideoError)
    this.video.removeEventListener('loadedmetadata', this.handleLoadedMetadata)
    this.video.removeAttribute('src')
    this.video.load()
  }

  private disposeEngine(): void {
    if (this.hls) {
      this.hls.destroy()
      this.hls = null
    }
    if (this.flv) {
      this.flv.destroy()
      this.flv = null
    }
  }

  private handleTimeUpdate = (): void => {
    this.events.onTimeUpdate?.(this.video.currentTime)
  }

  private handleDurationChange = (): void => {
    this.events.onDuration?.(this.getDuration())
  }

  private handlePlay = (): void => {
    this.events.onPlaying?.()
  }

  private handlePause = (): void => {
    this.events.onPaused?.()
  }

  private handleEnded = (): void => {
    this.events.onEnded?.()
  }

  private handleLoadedMetadata = (): void => {
    this.events.onLoadedMetadata?.(this.video.videoWidth, this.video.videoHeight, this.getDuration())
  }

  private handleVideoError = (): void => {
    const code = this.video.error?.code ?? 0
    this.events.onError?.(code === 4 ? 'unsupported' : 'network', `video error ${code}`)
  }
}
