import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { persistNow, schedulePersist } from '../store/appStore'
import { PlayerCore, type PlayerErrorKind } from '../player/playerCore'
import { mediaItemFromPath, mediaItemFromUrl } from '../../../shared/source'
import { useAutoHide } from '../hooks/useAutoHide'
import ControlsBar from './ControlsBar'
import UrlInputOverlay from './UrlInputOverlay'

interface PlayerViewProps {
  instanceId: number
}

export default function PlayerView({ instanceId }: PlayerViewProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const coreRef = useRef<PlayerCore | null>(null)
  const [error, setError] = useState<{ kind: PlayerErrorKind; message: string } | null>(null)
  const [showUrlInput, setShowUrlInput] = useState(false)

  const instance = useAppStore((s) => s.instances[instanceId])
  const playlists = useAppStore((s) => s.playlists)
  const settings = useAppStore((s) => s.settings)
  const { visible, onMouseMove, onMouseEnter, onMouseLeave } = useAutoHide()

  const playlist = playlists.find((p) => p.id === instance.playlistId) ?? null
  const currentItem = playlist?.items[instance.currentIndex] ?? null

  const prevItemRef = useRef<{ playlistId: string; itemId: string } | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const core = new PlayerCore(video, {
      onPlaying: () => useAppStore.getState().updateInstance(instanceId, { isPlaying: true }),
      onPaused: () => useAppStore.getState().updateInstance(instanceId, { isPlaying: false }),
      onEnded: () => useAppStore.getState().nextInInstance(instanceId),
      onError: (kind, message) => setError({ kind, message })
    })
    coreRef.current = core
    return () => {
      core.destroy()
      coreRef.current = null
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
        // 续播成功：消费掉旧的记忆点，进度条标记随之下移，下次离开时再快照新位置
        if (instance.playlistId) {
          useAppStore.getState().updateItemLastPosition(instance.playlistId, currentItem.id, 0)
          schedulePersist()
        }
      }
      video.removeEventListener('loadedmetadata', onMeta)
    }
    video.addEventListener('loadedmetadata', onMeta)
    return () => video.removeEventListener('loadedmetadata', onMeta)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.id, settings.autoResume])

  const handleOpenFiles = async (): Promise<void> => {
    const paths = await window.api.dialog.openFile()
    if (!paths || paths.length === 0) return
    const items = paths.map(mediaItemFromPath)
    const playlist = {
      id: crypto.randomUUID(),
      name: items[0].title,
      items,
      createdAt: Date.now()
    }
    useAppStore.getState().addPlaylist(playlist)
    useAppStore.getState().updateInstance(instanceId, { playlistId: playlist.id, currentIndex: 0, isPlaying: true })
  }

  const handleOpenFolder = async (): Promise<void> => {
    const folder = await window.api.dialog.openFolder()
    if (!folder) return
    const items = await window.api.media.scanFolder(folder)
    if (items.length === 0) return
    const playlist = {
      id: crypto.randomUUID(),
      name: items[0].title,
      items,
      createdAt: Date.now()
    }
    useAppStore.getState().addPlaylist(playlist)
    useAppStore.getState().updateInstance(instanceId, { playlistId: playlist.id, currentIndex: 0, isPlaying: true })
  }

  const handleOpenUrl = (url: string): void => {
    const item = mediaItemFromUrl(url.trim())
    const playlist = { id: crypto.randomUUID(), name: item.title, items: [item], createdAt: Date.now() }
    useAppStore.getState().addPlaylist(playlist)
    useAppStore.getState().updateInstance(instanceId, { playlistId: playlist.id, currentIndex: 0, isPlaying: true })
  }

  const handleToggleMini = async (): Promise<void> => {
    const state = await window.api.window.getState()
    if (state.mode === 'mini') await window.api.window.exitMini()
    else await window.api.window.enterMini()
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
    <div className="player-view" onMouseMove={onMouseMove} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <video ref={videoRef} className="player-video" playsInline />
      <div className="player-title">{currentItem?.title ?? 'VHplayer'}</div>
      <div className="player-actions">
        <button title="打开文件" onClick={() => void handleOpenFiles()}>
          打开
        </button>
        <button title="打开文件夹" onClick={() => void handleOpenFolder()}>
          文件夹
        </button>
        <button title="打开网络流" onClick={() => setShowUrlInput(true)}>
          网络流
        </button>
        <button title="置顶小窗" onClick={() => void handleToggleMini()}>
          置顶
        </button>
        <button title="全屏" onClick={() => void window.api.window.toggleFullscreen()}>
          全屏
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
      {showUrlInput && <UrlInputOverlay onCancel={() => setShowUrlInput(false)} onConfirm={handleOpenUrl} />}
    </div>
  )
}
