import { useEffect, useRef, useState } from 'react'
import { useAutoHide } from '../hooks/useAutoHide'
import { useAppStore } from '../store/appStore'

interface ControlsBarProps {
  instanceId: number
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const MODE_LABEL: Record<string, string> = { order: '顺序', loop: '循环', random: '随机' }

export default function ControlsBar({ instanceId }: ControlsBarProps): React.JSX.Element {
  const instance = useAppStore((s) => s.instances[instanceId])
  const playlists = useAppStore((s) => s.playlists)
  const { visible, onMouseMove, onMouseEnter, onMouseLeave } = useAutoHide()

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)

  const playlist = playlists.find((p) => p.id === instance.playlistId) ?? null
  const currentItem = playlist?.items[instance.currentIndex] ?? null

  useEffect(() => {
    const root = document.querySelector('.player-view')
    videoRef.current = (root?.querySelector('video') as HTMLVideoElement | null) ?? null
  }, [instanceId])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onTime = (): void => setCurrentTime(video.currentTime)
    const onDur = (): void => setDuration(video.duration)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('durationchange', onDur)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('durationchange', onDur)
    }
  }, [videoRef.current])

  const seek = (value: number): void => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = value
    setCurrentTime(value)
  }

  const toggleVolume = (value: number): void => {
    useAppStore.getState().updateInstance(instanceId, { volume: value })
  }

  const toggleMuted = (): void => {
    const video = videoRef.current
    if (!video) return
    setMuted((m) => {
      video.muted = !m
      return !m
    })
  }

  const markPercent = currentItem?.lastPosition && duration > 0 ? (currentItem.lastPosition / duration) * 100 : null

  return (
    <div
      className={`controls-bar ${visible ? 'visible' : ''}`}
      onMouseMove={onMouseMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="seek-row">
        <div className="seek-track">
          <input
            type="range"
            className="seek-range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(e) => seek(Number(e.target.value))}
            disabled={duration <= 0}
          />
          {markPercent !== null && (
            <span className="mark-dot" style={{ left: `${markPercent}%` }} title="记忆位置" />
          )}
        </div>
        <span className="time-label">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      <div className="btn-row">
        <button title="上一集" onClick={() => useAppStore.getState().prevInInstance(instanceId)}>
          ⏮
        </button>
        <button
          title={instance.isPlaying ? '暂停' : '播放'}
          onClick={() => {
            const video = videoRef.current
            if (!video) return
            if (video.paused) void video.play()
            else video.pause()
          }}
        >
          {instance.isPlaying ? '⏸' : '▶'}
        </button>
        <button title="下一集" onClick={() => useAppStore.getState().nextInInstance(instanceId)}>
          ⏭
        </button>
        <button title="倍速" onClick={() => useAppStore.getState().cycleRate(instanceId)}>
          {instance.rate}x
        </button>
        <button title="播放模式" onClick={() => useAppStore.getState().cyclePlayMode(instanceId)}>
          {MODE_LABEL[instance.playMode] ?? instance.playMode}
        </button>
        <div className="volume-wrap">
          <button title={muted ? '取消静音' : '静音'} onClick={toggleMuted}>
            {muted ? '🔇' : '🔊'}
          </button>
          <input
            type="range"
            className="volume-range"
            min={0}
            max={1}
            step={0.01}
            value={instance.volume}
            onChange={(e) => toggleVolume(Number(e.target.value))}
          />
        </div>
      </div>
    </div>
  )
}
