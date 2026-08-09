import { useAppStore } from '../store/appStore'
import type { DownloadTask } from '../../../shared/types'
import { Icon } from './icons'

function statusLabel(t: DownloadTask): string {
  if (t.status === 'queued') return '等待中'
  if (t.status === 'done') return '已完成'
  if (t.status === 'error') return '失败'
  return `${Math.round(t.progress * 100)}%`
}

export default function DownloadPopup(): React.JSX.Element | null {
  const downloads = useAppStore((s) => s.downloads)
  const notice = useAppStore((s) => s.downloadNotice)

  if (downloads.length === 0 && !notice) return null

  return (
    <div className="download-popup">
      {notice && (
        <div className="download-notice">
          <span>{notice}</span>
        </div>
      )}
      {downloads.map((t) => (
        <div key={t.id} className={`download-task ${t.status}`}>
          <div className="download-task-main">
            <span className="download-task-title" title={t.title}>
              {t.title}
            </span>
            <span className="download-task-label">{statusLabel(t)}</span>
          </div>
          <div className="download-progress">
            <div
              className={`download-progress-fill${t.duration ? '' : ' indeterminate'}`}
              style={t.duration ? { width: `${t.progress * 100}%` } : undefined}
            />
          </div>
          {t.error && <div className="download-task-error">{t.error}</div>}
          <div className="download-task-actions">
            {(t.status === 'running' || t.status === 'queued') && (
              <button title="取消" onClick={() => void useAppStore.getState().cancelDownload(t.id)}>
                <Icon name="x" size={13} />
              </button>
            )}
            {t.status === 'done' && (
              <button title="打开目录" onClick={() => void window.api.download.showInFolder(t.id)}>
                打开目录
              </button>
            )}
            {(t.status === 'done' || t.status === 'error') && (
              <button title="移除" onClick={() => void useAppStore.getState().dismissDownload(t.id)}>
                <Icon name="x" size={13} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
