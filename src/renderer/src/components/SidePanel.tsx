import { useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { sortItems, type SortMode } from '../store/playlistUtils'
import { openFiles, openFolder, openUrlInput } from '../store/openMedia'

const SORT_OPTIONS: Array<{ mode: SortMode; label: string }> = [
  { mode: 'name', label: '名称' },
  { mode: 'timeAsc', label: '时间正序' },
  { mode: 'timeDesc', label: '时间倒序' }
]

export default function SidePanel(): React.JSX.Element | null {
  const panelOpen = useAppStore((s) => s.panelOpen)
  const panelTab = useAppStore((s) => s.panelTab)
  const playlists = useAppStore((s) => s.playlists)
  const favorites = useAppStore((s) => s.favorites)
  const instances = useAppStore((s) => s.instances)
  const activeInstance = useAppStore((s) => s.activeInstance)
  const sortMode = useAppStore((s) => s.sortMode)
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const dragFromRef = useRef<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)

  if (!panelOpen) return null

  const state = useAppStore.getState()
  const instance = instances[activeInstance]
  const effectiveListId = selectedListId ?? instance.playlistId ?? playlists[0]?.id ?? null
  const list = playlists.find((p) => p.id === effectiveListId) ?? null
  const mode = sortMode[effectiveListId ?? ''] ?? 'timeDesc'
  const displayItems = list
    ? sortItems(list.items, mode).map((item) => ({ item, index: list.items.indexOf(item) }))
    : []
  const isCurrent = (listId: string, index: number): boolean =>
    instance.playlistId === listId && instance.currentIndex === index

  return (
    <>
      <div className="side-panel-mask" onClick={() => state.closePanel()} />
      <aside className="side-panel">
        <div className="panel-header">
          <div className="panel-tabs">
            <button className={panelTab === 'lists' ? 'active' : ''} onClick={() => state.setPanelTab('lists')}>
              播放列表
            </button>
            <button className={panelTab === 'favorites' ? 'active' : ''} onClick={() => state.setPanelTab('favorites')}>
              收藏
            </button>
          </div>
          <button className="panel-close" title="关闭" onClick={() => state.closePanel()}>
            ×
          </button>
        </div>
        {panelTab === 'lists' ? (
          <div className="panel-body">
            <div className="panel-add-actions">
              <button onClick={() => void openFiles(activeInstance)}>打开文件</button>
              <button onClick={() => void openFolder(activeInstance)}>文件夹</button>
              <button onClick={() => openUrlInput()}>网络流</button>
            </div>
            {playlists.length === 0 ? (
              <div className="panel-empty">暂无播放列表，点击上方按钮添加</div>
            ) : (
              <>
                <select
                  className="panel-list-select"
                  value={effectiveListId ?? ''}
                  onChange={(e) => setSelectedListId(e.target.value || null)}
                >
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="panel-sort-actions">
                  {SORT_OPTIONS.map((o) => (
                    <button
                      key={o.mode}
                      className={mode === o.mode ? 'active' : ''}
                      onClick={() => state.setSortMode(effectiveListId ?? '', o.mode)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {displayItems.length === 0 ? (
                  <div className="panel-empty">列表为空</div>
                ) : (
                  <ul className="panel-items">
                    {displayItems.map(({ item, index }) => (
                      <li
                        key={item.id}
                        className={`panel-item${isCurrent(effectiveListId ?? '', index) ? ' current' : ''}${
                          dropTarget === index ? ' drag-over' : ''
                        }`}
                        draggable
                        onDragStart={() => {
                          dragFromRef.current = index
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          setDropTarget(index)
                        }}
                        onDragLeave={() => setDropTarget((t) => (t === index ? null : t))}
                        onDrop={(e) => {
                          e.preventDefault()
                          const from = dragFromRef.current
                          dragFromRef.current = null
                          if (from !== null && from !== index) {
                            state.reorderItems(effectiveListId ?? '', from, index)
                          }
                          setDropTarget(null)
                        }}
                        onClick={() => state.playItemFromList(effectiveListId ?? '', index)}
                      >
                        <span className="panel-item-title">{item.title}</span>
                        <button
                          className="panel-item-del"
                          title="删除"
                          onClick={(e) => {
                            e.stopPropagation()
                            state.removeFromPlaylist(effectiveListId ?? '', item.id)
                          }}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="panel-footer">
                  <button className="panel-clear" onClick={() => state.clearPlaylist(effectiveListId ?? '')}>
                    清空列表
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="panel-body">
            {favorites.items.length === 0 ? (
              <div className="panel-empty">暂无收藏</div>
            ) : (
              <ul className="panel-items">
                {favorites.items.map((item, index) => (
                  <li
                    key={item.id}
                    className={`panel-item${isCurrent('favorites', index) ? ' current' : ''}`}
                    onClick={() => state.playItemFromList('favorites', index)}
                  >
                    <span className="panel-item-title">{item.title}</span>
                    <button
                      className="panel-item-del"
                      title="取消收藏"
                      onClick={(e) => {
                        e.stopPropagation()
                        state.removeFromFavorites(item.id)
                      }}
                    >
                      ♥
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>
    </>
  )
}
