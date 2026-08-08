import { useEffect, useRef, useState } from 'react'

interface UrlInputOverlayProps {
  onCancel: () => void
  onConfirm: (url: string) => void
}

export default function UrlInputOverlay({ onCancel, onConfirm }: UrlInputOverlayProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = (): void => {
    if (value.trim()) onConfirm(value)
  }

  return (
    <div className="url-overlay" onClick={onCancel}>
      <div className="url-panel" onClick={(e) => e.stopPropagation()}>
        <div className="url-title">打开网络流（m3u8 / flv / 直链）</div>
        <input
          ref={inputRef}
          className="url-input"
          placeholder="https://example.com/live.m3u8"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="url-actions">
          <button onClick={onCancel}>取消</button>
          <button className="primary" onClick={submit} disabled={!value.trim()}>
            播放
          </button>
        </div>
      </div>
    </div>
  )
}
