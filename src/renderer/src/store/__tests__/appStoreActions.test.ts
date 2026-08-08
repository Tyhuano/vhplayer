import { useAppStore } from '../appStore'
import type { Playlist, StoreSnapshot } from '../../../../shared/types'

function makeSnapshot(over: Partial<StoreSnapshot> = {}): StoreSnapshot {
  return {
    playlists: [{ id: 'p1', name: '列表', items: [{ id: 'm1', title: '一', sourceType: 'file', value: 'C:\\a.mp4' }], createdAt: 1 }],
    favorites: { id: 'favorites', name: '收藏', items: [], createdAt: 0 },
    settings: { downloadDir: '', autoResume: true },
    instances: [0, 1, 2, 3].map((id) => ({
      id,
      playlistId: null,
      currentIndex: 0,
      playMode: 'order' as const,
      isPlaying: false,
      volume: 1,
      rate: 1,
      scaleMode: 'contain' as const
    })),
    ...over
  }
}

describe('appStore actions', () => {
  beforeEach(() => {
    useAppStore.setState({
      ...makeSnapshot(),
      panelOpen: false,
      panelTab: 'lists',
      sortMode: {},
      menuOpen: false,
      menuX: 0,
      menuY: 0,
      urlInputOpen: false
    })
  })

  it('toggleFavorite 收藏当前播放项（引用复制）', () => {
    useAppStore.getState().updateInstance(0, { playlistId: 'p1', currentIndex: 0 })
    useAppStore.getState().toggleFavorite()
    const favs = useAppStore.getState().favorites.items
    expect(favs).toHaveLength(1)
    expect(favs[0].id).toBe('m1')
  })

  it('收藏为引用复制：收藏后删除原列表项不影响收藏夹', () => {
    useAppStore.getState().updateInstance(0, { playlistId: 'p1', currentIndex: 0 })
    useAppStore.getState().toggleFavorite()
    useAppStore.getState().removeFromPlaylist('p1', 'm1')
    expect(useAppStore.getState().favorites.items).toHaveLength(1)
    expect(useAppStore.getState().favorites.items[0].id).toBe('m1')
  })

  it('toggleFavorite 切换语义：再点取消，往返不产生重复项', () => {
    useAppStore.getState().updateInstance(0, { playlistId: 'p1', currentIndex: 0 })
    useAppStore.getState().toggleFavorite()
    expect(useAppStore.getState().favorites.items).toHaveLength(1)
    useAppStore.getState().toggleFavorite()
    expect(useAppStore.getState().favorites.items).toHaveLength(0)
    useAppStore.getState().toggleFavorite()
    expect(useAppStore.getState().favorites.items).toHaveLength(1)
  })

  it('无播放项时 toggleFavorite no-op', () => {
    const before = useAppStore.getState().favorites
    useAppStore.getState().toggleFavorite()
    expect(useAppStore.getState().favorites).toBe(before)
  })

  it('removeFromFavorites 移除单项', () => {
    useAppStore.getState().updateInstance(0, { playlistId: 'p1', currentIndex: 0 })
    useAppStore.getState().toggleFavorite()
    useAppStore.getState().removeFromFavorites('m1')
    expect(useAppStore.getState().favorites.items).toHaveLength(0)
  })

  it('reorderItems 写回播放列表顺序', () => {
    const p1: Playlist = {
      id: 'p1',
      name: '列表',
      items: [
        { id: 'm1', title: '一', sourceType: 'file', value: 'C:\\a.mp4' },
        { id: 'm2', title: '二', sourceType: 'file', value: 'C:\\b.mp4' },
        { id: 'm3', title: '三', sourceType: 'file', value: 'C:\\c.mp4' }
      ],
      createdAt: 1
    }
    useAppStore.setState({ playlists: [p1] })
    useAppStore.getState().reorderItems('p1', 0, 2)
    expect(useAppStore.getState().playlists[0].items.map((i) => i.id)).toEqual(['m2', 'm3', 'm1'])
  })

  it('setSortMode 记录内存态排序方式', () => {
    useAppStore.getState().setSortMode('p1', 'timeDesc')
    expect(useAppStore.getState().sortMode['p1']).toBe('timeDesc')
  })

  it('playItemFromList 更新活动实例', () => {
    useAppStore.getState().playItemFromList('p1', 0)
    const ins = useAppStore.getState().instances[0]
    expect(ins.playlistId).toBe('p1')
    expect(ins.currentIndex).toBe(0)
    expect(ins.isPlaying).toBe(true)
  })

  it('setScaleMode / setPlayMode / setRate 直设', () => {
    useAppStore.getState().setScaleMode(0, 'fill')
    useAppStore.getState().setPlayMode(0, 'random')
    useAppStore.getState().setRate(0, 2)
    const ins = useAppStore.getState().instances[0]
    expect(ins.scaleMode).toBe('fill')
    expect(ins.playMode).toBe('random')
    expect(ins.rate).toBe(2)
  })

  it('面板/菜单/网络流输入开关', () => {
    const s = useAppStore.getState()
    s.openPanel()
    expect(useAppStore.getState().panelOpen).toBe(true)
    s.setPanelTab('favorites')
    s.togglePanel()
    expect(useAppStore.getState().panelOpen).toBe(false)
    s.openMenu(10, 20)
    expect(useAppStore.getState().menuOpen).toBe(true)
    expect(useAppStore.getState().menuX).toBe(10)
    s.closeMenu()
    expect(useAppStore.getState().menuOpen).toBe(false)
    s.openUrlInput()
    expect(useAppStore.getState().urlInputOpen).toBe(true)
    s.closeUrlInput()
    expect(useAppStore.getState().urlInputOpen).toBe(false)
  })

  it('hydrate 时收藏夹损坏兜底为空收藏夹', () => {
    useAppStore.getState().hydrate({ ...makeSnapshot(), favorites: null as unknown as never })
    expect(useAppStore.getState().favorites).toEqual({ id: 'favorites', name: '收藏', items: [], createdAt: 0 })
  })

  it('removeFromPlaylist / clearPlaylist', () => {
    useAppStore.getState().removeFromPlaylist('p1', 'm1')
    expect(useAppStore.getState().playlists[0].items).toHaveLength(0)
    useAppStore.getState().clearPlaylist('p1')
    expect(useAppStore.getState().playlists[0].items).toHaveLength(0)
  })

  it('createPlaylist 创建空列表并返回 id', () => {
    const id = useAppStore.getState().createPlaylist('我的列表')
    const list = useAppStore.getState().playlists.find((p) => p.id === id)
    expect(list?.name).toBe('我的列表')
    expect(list?.items).toHaveLength(0)
    expect(list?.createdAt).toBeGreaterThan(0)
  })

  it('addItemsToPlaylist 追加引用快照到指定列表', () => {
    const id = useAppStore.getState().createPlaylist('我的列表')
    useAppStore.getState().addItemsToPlaylist(id, [
      { id: 'n1', title: '新一', sourceType: 'file', value: 'C:\\n1.mp4', createdAt: 1 }
    ])
    const list = useAppStore.getState().playlists.find((p) => p.id === id)
    expect(list?.items).toHaveLength(1)
    expect(list?.items[0].value).toBe('C:\\n1.mp4')
    useAppStore.getState().addItemsToPlaylist(id, [
      { id: 'n2', title: '新二', sourceType: 'url', value: 'https://x.com/v.m3u8', createdAt: 2 }
    ])
    expect(useAppStore.getState().playlists.find((p) => p.id === id)?.items).toHaveLength(2)
  })
})
