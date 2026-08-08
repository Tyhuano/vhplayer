import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import SidePanel from '../SidePanel'
import { useAppStore } from '../../store/appStore'
import type { Playlist } from '../../../../shared/types'

function makePlaylists(): Playlist[] {
  return [
    {
      id: 'p1',
      name: '列表一',
      items: [
        { id: 'm1', title: '甲', sourceType: 'file', value: 'C:\\a.mp4', createdAt: 3 },
        { id: 'm2', title: '乙', sourceType: 'file', value: 'C:\\b.mp4', createdAt: 1 },
        { id: 'm3', title: '丙', sourceType: 'file', value: 'C:\\c.mp4', createdAt: 2 }
      ],
      createdAt: 1
    }
  ]
}

describe('SidePanel', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    useAppStore.setState({
      panelOpen: true,
      panelTab: 'lists',
      sortMode: {},
      playlists: makePlaylists(),
      favorites: { id: 'favorites', name: '收藏', items: [], createdAt: 0 },
      instances: [0, 1, 2, 3].map((id) => ({
        id,
        playlistId: null,
        currentIndex: 0,
        playMode: 'order' as const,
        isPlaying: false,
        volume: 1,
        rate: 1,
        scaleMode: 'contain' as const
      }))
    })
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
      root = null
      container.remove()
    })
  })

  function renderPanel(): void {
    act(() => {
      root = createRoot(container)
      root.render(<SidePanel />)
    })
  }

  function items(): HTMLElement[] {
    return Array.from(container.querySelectorAll('.panel-item'))
  }

  function setInputValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  it('渲染播放列表 tab 与列表项（默认时间倒序：新在前）', () => {
    renderPanel()
    expect(items()).toHaveLength(3)
    const titles = items().map((e) => e.querySelector('.panel-item-title')?.textContent)
    expect(titles).toEqual(['甲', '丙', '乙'])
  })

  it('切换排序方式为名称后按名称排列', () => {
    renderPanel()
    const btn = Array.from(container.querySelectorAll('.panel-sort-actions button')).find(
      (b) => b.textContent === '名称'
    ) as HTMLElement
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const titles = items().map((e) => e.querySelector('.panel-item-title')?.textContent)
    expect(titles).toEqual(['丙', '甲', '乙'])
  })

  it('点击列表项播放（playItemFromList 更新活动实例）', () => {
    renderPanel()
    act(() => {
      items()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const ins = useAppStore.getState().instances[0]
    expect(ins.playlistId).toBe('p1')
    expect(ins.isPlaying).toBe(true)
    expect(ins.currentIndex).toBe(useAppStore.getState().playlists[0].items.findIndex((i) => i.id === 'm1'))
  })

  it('拖拽排序：dragstart/dragover/drop 后写回列表顺序', () => {
    // 默认时间倒序显示 [m1(原0), m3(原2), m2(原1)]
    // 拖显示首项 m1(原0) 到显示第三项 m2(原1) 的位置 → reorder(0,1) → [m2, m1, m3]
    renderPanel()
    const [first] = items()
    const last = items()[2]
    act(() => {
      first.dispatchEvent(new Event('dragstart', { bubbles: true }))
      last.dispatchEvent(new Event('dragover', { bubbles: true }))
      last.dispatchEvent(new Event('drop', { bubbles: true }))
    })
    expect(useAppStore.getState().playlists[0].items.map((i) => i.id)).toEqual(['m2', 'm1', 'm3'])
  })

  it('hover 删除按钮移除单项', () => {
    renderPanel()
    const del = items()[0].querySelector('.panel-item-del') as HTMLElement
    act(() => {
      del.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().playlists[0].items).toHaveLength(2)
  })

  it('清空列表', () => {
    renderPanel()
    const btn = container.querySelector('.panel-clear') as HTMLElement
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().playlists[0].items).toHaveLength(0)
  })

  it('tab 切换收藏并记忆（重渲染保持）', () => {
    renderPanel()
    const tab = Array.from(container.querySelectorAll('.panel-tabs button')).find(
      (b) => b.textContent === '收藏'
    ) as HTMLElement
    act(() => {
      tab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().panelTab).toBe('favorites')
    expect(container.querySelector('.panel-empty')?.textContent).toContain('收藏')
  })

  it('收藏 tab 显示收藏项并可取消收藏', () => {
    useAppStore.setState({
      panelTab: 'favorites',
      favorites: {
        id: 'favorites',
        name: '收藏',
        items: [{ id: 'f1', title: '喜欢的', sourceType: 'url', value: 'https://x.com/v.mp4' }],
        createdAt: 2
      }
    })
    renderPanel()
    expect(items()).toHaveLength(1)
    const del = items()[0].querySelector('.panel-item-del') as HTMLElement
    act(() => {
      del.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().favorites.items).toHaveLength(0)
  })

  it('「打开文件」按钮复用共享逻辑（dialog + fromPaths mock）', async () => {
    const openFileMock = window.api.dialog.openFile as jest.Mock
    openFileMock.mockResolvedValue(['C:\\x\\movie.mp4'])
    const fromPathsMock = window.api.media.fromPaths as jest.Mock
    fromPathsMock.mockResolvedValue([
      { id: 'x1', title: 'movie', sourceType: 'file', value: 'C:\\x\\movie.mp4', createdAt: 100 }
    ])
    renderPanel()
    const btn = Array.from(container.querySelectorAll('.panel-add-actions button')).find(
      (b) => b.textContent === '打开文件'
    ) as HTMLElement
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    const playlists = useAppStore.getState().playlists
    expect(playlists).toHaveLength(2)
    expect(playlists[1].items[0].title).toBe('movie')
  })

  it('遮罩点击关闭面板', () => {
    renderPanel()
    const mask = container.querySelector('.side-panel-mask') as HTMLElement
    act(() => {
      mask.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().panelOpen).toBe(false)
  })

  it('新建列表：输入名称点 √ 创建并选中', () => {
    renderPanel()
    const createBtn = container.querySelector('.panel-create-btn') as HTMLElement
    act(() => {
      createBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const input = container.querySelector('.panel-text-input') as HTMLInputElement
    expect(input).not.toBeNull()
    act(() => {
      setInputValue(input, '我的片单')
    })
    const okBtn = container.querySelector('.panel-confirm-ok') as HTMLElement
    act(() => {
      okBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const playlists = useAppStore.getState().playlists
    expect(playlists).toHaveLength(2)
    expect(playlists[1].name).toBe('我的片单')
    expect(playlists[1].items).toHaveLength(0)
  })

  it('新建列表：点 × 取消不创建', () => {
    renderPanel()
    const createBtn = container.querySelector('.panel-create-btn') as HTMLElement
    act(() => {
      createBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const input = container.querySelector('.panel-text-input') as HTMLInputElement
    act(() => {
      setInputValue(input, '不保存的')
    })
    const cancelBtn = container.querySelector('.panel-confirm-cancel') as HTMLElement
    act(() => {
      cancelBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().playlists).toHaveLength(1)
  })

  it('重命名列表：点编辑 → 改名 → √ 保存', () => {
    renderPanel()
    const editBtn = container.querySelector('.panel-icon-btn') as HTMLElement
    act(() => {
      editBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const input = container.querySelector('.panel-text-input') as HTMLInputElement
    act(() => {
      setInputValue(input, '改名后的列表')
    })
    const okBtn = container.querySelector('.panel-confirm-ok') as HTMLElement
    act(() => {
      okBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useAppStore.getState().playlists[0].name).toBe('改名后的列表')
  })

  it('创建新列表后显示「正在播放」按钮，点击回到正在播放的列表', () => {
    useAppStore.setState({
      instances: [0, 1, 2, 3].map((id) => ({
        id,
        playlistId: id === 0 ? 'p1' : null,
        currentIndex: 0,
        playMode: 'order' as const,
        isPlaying: false,
        volume: 1,
        rate: 1,
        scaleMode: 'contain' as const
      }))
    })
    renderPanel()
    const createBtn = container.querySelector('.panel-create-btn') as HTMLElement
    act(() => {
      createBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const input = container.querySelector('.panel-text-input') as HTMLInputElement
    act(() => {
      setInputValue(input, '新列表')
    })
    act(() => {
      const ok = container.querySelector('.panel-confirm-ok') as HTMLElement
      ok.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const back = container.querySelector('.panel-back-playing') as HTMLElement
    expect(back).not.toBeNull()
    act(() => {
      back.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('.panel-list-name')?.textContent).toBe('列表一')
  })

  it('「添加文件」向当前列表追加引用快照（不覆盖其他列表）', async () => {
    const openFileMock = window.api.dialog.openFile as jest.Mock
    openFileMock.mockResolvedValue(['C:\\add.mp4'])
    const fromPathsMock = window.api.media.fromPaths as jest.Mock
    fromPathsMock.mockResolvedValue([
      { id: 'a1', title: 'add', sourceType: 'file', value: 'C:\\add.mp4', createdAt: 100 }
    ])
    renderPanel()
    const btn = Array.from(container.querySelectorAll('.panel-add-to-list button')).find(
      (b) => b.textContent === '添加文件'
    ) as HTMLElement
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    const p1 = useAppStore.getState().playlists.find((p) => p.id === 'p1')
    expect(p1?.items).toHaveLength(4)
    expect(p1?.items[3].value).toBe('C:\\add.mp4')
  })

  it('「添加流」输入 URL 点 √ 追加到当前列表', () => {
    renderPanel()
    const btn = Array.from(container.querySelectorAll('.panel-add-to-list button')).find(
      (b) => b.textContent === '添加流'
    ) as HTMLElement
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const input = container.querySelector('.panel-text-input') as HTMLInputElement
    act(() => {
      setInputValue(input, 'https://x.com/live.m3u8')
    })
    const okBtn = container.querySelector('.panel-confirm-ok') as HTMLElement
    act(() => {
      okBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const p1 = useAppStore.getState().playlists.find((p) => p.id === 'p1')
    expect(p1?.items).toHaveLength(4)
    expect(p1?.items[3].sourceType).toBe('m3u8')
    expect(p1?.items[3].value).toBe('https://x.com/live.m3u8')
  })
})
