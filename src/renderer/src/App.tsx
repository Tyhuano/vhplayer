import { useEffect, useState } from 'react'
import PlayerView from './components/PlayerView'
import SidePanel from './components/SidePanel'
import ContextMenu from './components/ContextMenu'
import UrlInputOverlay from './components/UrlInputOverlay'
import { Icon } from './components/icons'
import { useAppStore } from './store/appStore'
import { flushPositions, persistNow, persistPositionOnly } from './store/appStore'
import { openUrl } from './store/openMedia'
import { useShortcuts } from './hooks/useShortcuts'
import { useWindowDrag } from './hooks/useWindowDrag'
import { useWindowResize } from './hooks/useWindowResize'

/** 紧凑模式阈值：窗口小于该尺寸时仅保留播放区域（无最小尺寸限制，小窗由紧凑模式接管 UI） */
const COMPACT_MIN_W = 480
const COMPACT_MIN_H = 320

export default function App(): React.JSX.Element {
  const activeInstance = useAppStore((s) => s.activeInstance)
  const viewMode = useAppStore((s) => s.viewMode)
  const windowMode = useAppStore((s) => s.windowMode)
  const urlInputOpen = useAppStore((s) => s.urlInputOpen)
  const hydrate = useAppStore((s) => s.hydrate)
  const [compact, setCompact] = useState(false)
  useShortcuts()
  const { onMouseDown } = useWindowDrag()
  const { onPointerDown: onResizeStart } = useWindowResize()

  useEffect(() => {
    const update = (): void => {
      setCompact(window.innerWidth < COMPACT_MIN_W || window.innerHeight < COMPACT_MIN_H)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    window.api.store.getAll().then((snapshot) => hydrate(snapshot))
    void useAppStore.getState().syncWindowStateFromMain().catch(() => {})
  }, [hydrate])

  useEffect(() => {
    // 周期兜底：进程被强杀时也能保留最近播放位置（不更新 UI 记忆点）
    const timer = setInterval(() => {
      void persistPositionOnly().catch(() => {})
    }, 15000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    return window.api.app.onClosing(() => {
      flushPositions()
      void persistNow().finally(() => window.api.app.readyToClose())
    })
  }, [])

  const isGrid = viewMode === 'grid' && windowMode !== 'mini'
  const isCompact = compact && windowMode !== 'mini'
  // 分屏网格尺寸：窗口变化时重新计算并显式注入，保证 4 分屏始终完整铺满展示
  const [gridSize, setGridSize] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    const update = (): void => {
      setGridSize({ w: window.innerWidth, h: window.innerHeight })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return (
    <div className={`app${isCompact ? ' compact' : ''}`}>
      <div className="app-titlebar" onMouseDown={onMouseDown}>
        <div className="titlebar-buttons">
          <button title="最小化" onClick={() => void window.api.window.minimize()}>
            <Icon name="minus" />
          </button>
          <button title="关闭" className="titlebar-close" onClick={() => void window.api.window.close()}>
            <Icon name="x" />
          </button>
        </div>
      </div>
      {isGrid && gridSize ? (
        <div className="player-grid" style={{ width: `${gridSize.w}px`, height: `${gridSize.h}px` }}>
          {[0, 1, 2, 3].map((id) => (
            <PlayerView key={id} instanceId={id} />
          ))}
        </div>
      ) : (
        <PlayerView instanceId={activeInstance} />
      )}
      <div className="resize-handle" onPointerDown={onResizeStart} title="调整窗口大小" />
      <SidePanel />
      <ContextMenu />
      {urlInputOpen && (
        <UrlInputOverlay
          onCancel={() => useAppStore.getState().closeUrlInput()}
          onConfirm={(url) => {
            openUrl(activeInstance, url)
            useAppStore.getState().closeUrlInput()
          }}
        />
      )}
    </div>
  )
}
