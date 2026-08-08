import { useEffect } from 'react'
import PlayerView from './components/PlayerView'
import SidePanel from './components/SidePanel'
import ContextMenu from './components/ContextMenu'
import { Icon } from './components/icons'
import { useAppStore } from './store/appStore'
import { flushPositions, persistNow, persistPositionOnly } from './store/appStore'
import { useShortcuts } from './hooks/useShortcuts'
import { useWindowDrag } from './hooks/useWindowDrag'

export default function App(): React.JSX.Element {
  const activeInstance = useAppStore((s) => s.activeInstance)
  const hydrate = useAppStore((s) => s.hydrate)
  useShortcuts()
  const { onMouseDown } = useWindowDrag()

  useEffect(() => {
    window.api.store.getAll().then((snapshot) => hydrate(snapshot))
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

  return (
    <div className="app">
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
      <PlayerView instanceId={activeInstance} />
      <SidePanel />
      <ContextMenu />
    </div>
  )
}
