import { useEffect } from 'react'
import PlayerView from './components/PlayerView'
import SidePanel from './components/SidePanel'
import ContextMenu from './components/ContextMenu'
import { useAppStore } from './store/appStore'
import { flushPositions, persistNow, persistPositionOnly } from './store/appStore'
import { useShortcuts } from './hooks/useShortcuts'

export default function App(): React.JSX.Element {
  const activeInstance = useAppStore((s) => s.activeInstance)
  const hydrate = useAppStore((s) => s.hydrate)
  useShortcuts()

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
      <div className="app-titlebar" />
      <PlayerView instanceId={activeInstance} />
      <SidePanel />
      <ContextMenu />
    </div>
  )
}
