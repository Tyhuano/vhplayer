import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { persistNow, schedulePersist } from '../store/appStore'
import { PlayerCore, type PlayerErrorKind } from '../player/playerCore'
import { useAutoHide } from '../hooks/useAutoHide'
import { openFiles, openFolder } from '../store/openMedia'
import ControlsBar from './ControlsBar'
import { Icon } from './icons'

interface PlayerViewProps {
  instanceId: number
}

export default function PlayerView({ instanceId }: PlayerViewProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const coreRef = useRef<PlayerCore | null>(null)
  const [error, setError] = useState<{ kind: PlayerErrorKind; message: string } | null>(null)

  const instance = useAppStore((s) => s.instances[instanceId])
  const playlists = useAppStore((s) => s.playlists)
  const settings = useAppStore((s) => s.settings)
  const active = useAppStore((s) => s.activeInstance === instanceId)
  const viewMode = useAppStore((s) => s.viewMode)
  const pinned = useAppStore((s) => s.pinned)
  const { visible, onMouseMove, onMouseEnter, onMouseLeave } = useAutoHide()

  const playlist = playlists.find((p) => p.id === instance.playlistId) ?? null
  const currentItem = playlist?.items[instance.currentIndex] ?? null

  const prevItemRef = useRef<{ playlistId: string; itemId: string } | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    useAppStore.getState().registerVideo(instanceId, video)
    const core = new PlayerCore(video, {
      onPlaying: () => useAppStore.getState().updateInstance(instanceId, { isPlaying: true }),
      onPaused: () => useAppStore.getState().updateInstance(instanceId, { isPlaying: false }),
      onEnded: () => useAppStore.getState().nextInInstance(instanceId),
      onError: (kind, message) => setError({ kind, message }),
      onLoadedMetadata: (w, h) => useAppStore.getState().setVideoSize(instanceId, w, h)
    })
    coreRef.current = core
    return () => {
      core.destroy()
      coreRef.current = null
      useAppStore.getState().registerVideo(instanceId, null)
      useAppStore.getState().setVideoSize(instanceId, 0, 0)
    }
  }, [instanceId])

  useEffect(() => {
    const core = coreRef.current
    if (!core || !currentItem) return
    setError(null)
    // 离开上一个视频时快照其退出位置（关闭时由 flushPositions 兜底）
    const video = videoRef.current
    const prev = prevItemRef.current
    if (prev && video && video.currentTime > 2) {
      useAppStore.getState().updateItemLastPosition(prev.playlistId, prev.itemId, video.currentTime)
      schedulePersist()
    }
    prevItemRef.current = instance.playlistId ? { playlistId: instance.playlistId, itemId: currentItem.id } : null
    void (async () => {
      await core.load(currentItem)
      core.setVolume(instance.volume)
      core.setRate(instance.rate)
      if (instance.isPlaying) core.play()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.id, instance.playlistId])

  useEffect(() => {
    coreRef.current?.setVolume(instance.volume)
  }, [instance.volume])

  useEffect(() => {
    coreRef.current?.setRate(instance.rate)
  }, [instance.rate])

  useEffect(() => {
    if (!currentItem || !settings.autoResume) return
    const video = videoRef.current
    if (!video) return
    const onMeta = (): void => {
      const skipThreshold = Math.min(3, video.duration * 0.2)
      const pos = currentItem.lastPosition
      if (pos && pos >= 2 && pos < video.duration - skipThreshold) {
        video.currentTime = pos
        // 等 seek 真正完成后再消费记忆点（避免加载途中误清除）
        const onSeeked = (): void => {
          video.removeEventListener('seeked', onSeeked)
          if (instance.playlistId) {
            useAppStore.getState().updateItemLastPosition(instance.playlistId, currentItem.id, 0)
            schedulePersist()
          }
        }
        video.addEventListener('seeked', onSeeked)
      }
      video.removeEventListener('loadedmetadata', onMeta)
    }
    video.addEventListener('loadedmetadata', onMeta)
    return () => video.removeEventListener('loadedmetadata', onMeta)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.id, settings.autoResume])

  const handleToggleMini = (): void => {
    void useAppStore.getState().toggleMini()
  }

  const retry = (): void => {
    const core = coreRef.current
    const item = currentItem
    if (!core || !item) return
    setError(null)
    void (async () => {
      await core.load(item)
      core.play()
    })()
  }

  return (
    <div
      className={`player-view${active ? ' active' : ''}`}
      onMouseMove={onMouseMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={() => {
        if (useAppStore.getState().activeInstance !== instanceId) {
          useAppStore.getState().setActiveInstance(instanceId)
        }
      }}
    >
      <video ref={videoRef} className="player-video" style={{ objectFit: instance.scaleMode }} playsInline />
      <div className="player-title">{currentItem?.title ?? 'VHplayer'}</div>
      <div className="player-actions">
        <button title="打开文件" onClick={() => void openFiles(instanceId)}>
          <Icon name="file" />
        </button>
        <button title="打开文件夹" onClick={() => void openFolder(instanceId)}>
          <Icon name="folder" />
        </button>
        <button title="打开网络流" onClick={() => useAppStore.getState().openUrlInput()}>
          <Icon name="globe" />
        </button>
        <button
          title={viewMode === 'grid' ? '退出分屏' : '分屏'}
          onClick={() => useAppStore.getState().toggleGridMode()}
        >
          <Icon name="grid" />
        </button>
        <button title="播放列表" onClick={() => useAppStore.getState().togglePanel()}>
          <Icon name="list" />
        </button>
        <button
          title={pinned ? '取消置顶' : '置顶'}
          className={`pinned-btn${pinned ? ' active' : ''}`}
          onClick={() => void useAppStore.getState().togglePinned()}
        >
          <Icon name="pin" />
        </button>
        <button title="置顶小窗" onClick={() => void handleToggleMini()}>
          <Icon name="minimize2" />
        </button>
        <button title="全屏" onClick={() => void window.api.window.toggleFullscreen()}>
          <Icon name="maximize" />
        </button>
      </div>
      {error && (
        <div className="error-overlay" onClick={() => setError(null)}>
          <div className="error-text">
            播放失败（{error.kind === 'unsupported' ? '格式不支持' : error.kind === 'network' ? '网络错误' : '致命错误'}）
          </div>
          <div className="error-detail">{error.message}</div>
          <div className="error-actions" onClick={(e) => e.stopPropagation()}>
            <button onClick={retry}>重试</button>
            <button onClick={() => useAppStore.getState().nextInInstance(instanceId)}>下一项</button>
            <button onClick={() => setError(null)}>关闭</button>
          </div>
        </div>
      )}
      <ControlsBar instanceId={instanceId} visible={visible} />
    </div>
  )
}
