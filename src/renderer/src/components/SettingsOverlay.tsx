import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { Icon } from './icons'

export default function SettingsOverlay(): React.JSX.Element | null {
  const open = useAppStore((s) => s.settingsOpen)
  const settings = useAppStore((s) => s.settings)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useAppStore.getState().closeSettings()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const state = useAppStore.getState()

  const pickDir = (): void => {
    void (async () => {
      const dir = await window.api.dialog.openFolder()
      if (dir) state.setSettings({ downloadDir: dir })
    })()
  }

  return (
    <>
      <div className="settings-mask" onClick={() => state.closeSettings()} />
      <div className="settings-overlay">
        <div className="settings-header">
          <span>设置</span>
          <button className="panel-close" title="关闭" onClick={() => state.closeSettings()}>
            <Icon name="x" />
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">下载目录</div>
          <div className="settings-row-body">
            <span className="settings-dir-path" title={settings.downloadDir}>
              {settings.downloadDir || '系统下载目录'}
            </span>
            <button onClick={pickDir}>选择目录</button>
            {settings.downloadDir && <button onClick={() => state.setSettings({ downloadDir: '' })}>恢复默认</button>}
          </div>
        </div>
        <label className="settings-row settings-checkbox">
          <input
            type="checkbox"
            checked={settings.autoResume}
            onChange={(e) => state.setSettings({ autoResume: e.target.checked })}
          />
          <span>自动续播（打开时从上次位置继续）</span>
        </label>
      </div>
    </>
  )
}
