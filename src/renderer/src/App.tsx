import { useEffect } from 'react'
import PlayerView from './components/PlayerView'
import { useAppStore } from './store/appStore'
import { persistNow } from './store/appStore'
import { useShortcuts } from './hooks/useShortcuts'

export default function App(): React.JSX.Element {
  const activeInstance = useAppStore((s) => s.activeInstance)
  const hydrate = useAppStore((s) => s.hydrate)
  useShortcuts()

  useEffect(() => {
    window.api.store.getAll().then((snapshot) => hydrate(snapshot))
  }, [hydrate])

  useEffect(() => {
    return window.api.app.onClosing(() => {
      void persistNow().finally(() => window.api.app.readyToClose())
    })
  }, [])

  return (
    <div className="app">
      <div className="app-titlebar" />
      <PlayerView instanceId={activeInstance} />
    </div>
  )
}
