import { useEffect, useRef, useState } from 'react'
import { useAppStore, MODES, MODE_LABEL, RATES } from '../store/appStore'
import { openFiles, openFolder, openUrlInput } from '../store/openMedia'

export function clampMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  vw: number,
  vh: number
): { x: number; y: number } {
  return {
    x: x + width > vw ? Math.max(0, vw - width - 4) : x,
    y: y + height > vh ? Math.max(0, vh - height - 4) : y
  }
}

interface MenuEntry {
  id: string
  label: string
  disabled?: boolean
  checked?: boolean
  divider?: boolean
  submenu?: MenuEntry[]
  action?: () => void
}

export default function ContextMenu(): React.JSX.Element | null {
  const menuOpen = useAppStore((s) => s.menuOpen)
  const menuX = useAppStore((s) => s.menuX)
  const menuY = useAppStore((s) => s.menuY)
  const [pos, setPos] = useState({ x: menuX, y: menuY })
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos(clampMenuPosition(menuX, menuY, rect.width, rect.height, window.innerWidth ?? 0, window.innerHeight ?? 0))
  }, [menuOpen, menuX, menuY])

  useEffect(() => {
    if (!menuOpen) return
    const onMouseDown = (e: MouseEvent): void => {
      const el = menuRef.current
      if (el && !el.contains(e.target as Node)) useAppStore.getState().closeMenu()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useAppStore.getState().closeMenu()
    }
    const onWheel = (e: WheelEvent): void => {
      const el = menuRef.current
      if (el && !el.contains(e.target as Node)) useAppStore.getState().closeMenu()
    }
    const onBlur = (): void => useAppStore.getState().closeMenu()
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('blur', onBlur)
    }
  }, [menuOpen])

  if (!menuOpen) return null

  const state = useAppStore.getState()
  const ins = state.instances[state.activeInstance]
  const list = ins.playlistId === 'favorites' ? state.favorites : state.playlists.find((p) => p.id === ins.playlistId)
  const item = list?.items[ins.currentIndex] ?? null
  const hasItem = !!item
  const isFav = item ? state.favorites.items.some((f) => f.id === item.id) : false

  const togglePlay = (): void => {
    const video = useAppStore.getState().videoRegistry[useAppStore.getState().activeInstance]
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }

  const entries: MenuEntry[] = [
    { id: 'toggle-play', label: ins.isPlaying ? '暂停' : '播放', disabled: !hasItem, action: togglePlay },
    { id: 'prev', label: '上一集', disabled: !hasItem, action: () => state.prevInInstance(state.activeInstance) },
    { id: 'next', label: '下一集', disabled: !hasItem, action: () => state.nextInInstance(state.activeInstance) },
    {
      id: 'mode',
      label: '播放模式',
      disabled: !hasItem,
      submenu: MODES.map((m) => ({
        id: `mode-${m}`,
        label: MODE_LABEL[m],
        checked: ins.playMode === m,
        action: () => state.setPlayMode(state.activeInstance, m)
      }))
    },
    {
      id: 'rate',
      label: '倍速',
      disabled: !hasItem,
      submenu: RATES.map((r) => ({
        id: `rate-${r}`,
        label: `${r}x`,
        checked: ins.rate === r,
        action: () => state.setRate(state.activeInstance, r)
      }))
    },
    {
      id: 'scale',
      label: '画面缩放',
      disabled: !hasItem,
      submenu: (
        [
          ['contain', '适应'],
          ['fill', '铺满']
        ] as const
      ).map(([v, label]) => ({
        id: `scale-${v}`,
        label,
        checked: ins.scaleMode === v,
        action: () => state.setScaleMode(state.activeInstance, v)
      }))
    },
    { id: 'fav', label: isFav ? '取消收藏' : '收藏', disabled: !hasItem, action: () => state.toggleFavorite() },
    { id: 'panel', label: '打开播放列表', action: () => state.togglePanel() },
    {
      id: 'sources',
      label: '来源管理',
      submenu: [
        { id: 'src-files', label: '打开文件', action: () => void openFiles(state.activeInstance) },
        { id: 'src-folder', label: '打开文件夹', action: () => void openFolder(state.activeInstance) },
        { id: 'src-url', label: '网络流', action: () => openUrlInput() }
      ]
    },
    { id: 'div1', label: '', divider: true },
    { id: 'download', label: '下载 MP4', disabled: true },
    { id: 'import', label: '导入 .mhlb', disabled: true },
    { id: 'export', label: '导出 .mhlb', disabled: true },
    { id: 'settings', label: '设置', disabled: true }
  ]

  const renderEntry = (entry: MenuEntry): React.JSX.Element => {
    if (entry.divider) return <div key={entry.id} className="menu-divider" />
    return (
      <div
        key={entry.id}
        className={`menu-item${entry.disabled ? ' disabled' : ''}${entry.checked ? ' checked' : ''}${
          entry.submenu ? ' has-submenu' : ''
        }`}
        onClick={() => {
          if (entry.disabled) return
          if (entry.submenu) return
          entry.action?.()
          useAppStore.getState().closeMenu()
        }}
      >
        <span className="menu-label">{entry.label}</span>
        {entry.checked && <span className="menu-check">✓</span>}
        {entry.submenu && <div className="submenu">{entry.submenu.map(renderEntry)}</div>}
      </div>
    )
  }

  return (
    <div ref={menuRef} className="context-menu" style={{ left: pos.x, top: pos.y }}>
      {entries.map(renderEntry)}
    </div>
  )
}
