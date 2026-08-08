import { useAppStore } from './store/appStore'

export default function App(): React.JSX.Element {
  const viewMode = useAppStore((s) => s.viewMode)
  const activeInstance = useAppStore((s) => s.activeInstance)
  const instanceCount = useAppStore((s) => s.instances.length)

  return (
    <div className="app">
      <header className="titlebar">VHplayer</header>
      <main className="stage">
        模式 {viewMode} · 活动格 {activeInstance + 1}/{instanceCount}（后续阶段填充）
      </main>
    </div>
  )
}
