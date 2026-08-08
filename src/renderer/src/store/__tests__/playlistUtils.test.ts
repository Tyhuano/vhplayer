import { playlistKindLabel, reorderItems, sortItems } from '../playlistUtils'
import type { MediaItem, Playlist } from '../../../../shared/types'

function item(id: string, title: string, createdAt?: number): MediaItem {
  return { id, title, sourceType: 'file', value: `C:\\v\\${id}.mp4`, createdAt }
}

const list: MediaItem[] = [item('a', '甲', 3), item('b', '乙', 1), item('c', '丙', 2)]

describe('playlistUtils', () => {
  describe('reorderItems', () => {
    it('首项拖到末尾', () => {
      expect(reorderItems(list, 0, 2).map((i) => i.id)).toEqual(['b', 'c', 'a'])
    })

    it('末尾项拖到首位', () => {
      expect(reorderItems(list, 2, 0).map((i) => i.id)).toEqual(['c', 'a', 'b'])
    })

    it('相邻移动', () => {
      expect(reorderItems(list, 0, 1).map((i) => i.id)).toEqual(['b', 'a', 'c'])
    })

    it('越界或相同位置返回原数组（不修改）', () => {
      expect(reorderItems(list, 0, 0)).toBe(list)
      expect(reorderItems(list, -1, 2)).toBe(list)
      expect(reorderItems(list, 0, 99)).toBe(list)
    })
  })

  describe('sortItems', () => {
    it('按名称排序（拼音序，不修改原数组）', () => {
      const out = sortItems(list, 'name')
      expect(out.map((i) => i.id)).toEqual(['c', 'a', 'b'])
      expect(list.map((i) => i.id)).toEqual(['a', 'b', 'c'])
      expect(out).not.toBe(list)
    })

    it('按时间正序', () => {
      expect(sortItems(list, 'timeAsc').map((i) => i.id)).toEqual(['b', 'c', 'a'])
    })

    it('按时间倒序', () => {
      expect(sortItems(list, 'timeDesc').map((i) => i.id)).toEqual(['a', 'c', 'b'])
    })

    it('createdAt 缺失回退 0（视为最旧）', () => {
      const withMissing: MediaItem[] = [item('m1', 'x', 100), item('m2', 'y')]
      expect(sortItems(withMissing, 'timeAsc').map((i) => i.id)).toEqual(['m2', 'm1'])
    })
  })

  describe('playlistKindLabel', () => {
    function playlist(over: Partial<Playlist> = {}): Playlist {
      return { id: 'p', name: '列表', items: [], createdAt: 1, ...over }
    }

    it('folder/files 来源为「视频」', () => {
      expect(playlistKindLabel(playlist({ source: 'folder' }))).toBe('视频')
      expect(playlistKindLabel(playlist({ source: 'files' }))).toBe('视频')
    })

    it('url 来源为「流」', () => {
      expect(playlistKindLabel(playlist({ source: 'url' }))).toBe('流')
    })

    it('manual 或空列表为「列表」', () => {
      expect(playlistKindLabel(playlist({ source: 'manual' }))).toBe('列表')
      expect(playlistKindLabel(playlist())).toBe('列表')
    })

    it('旧数据无 source 时按首项 sourceType 回退', () => {
      expect(playlistKindLabel(playlist({ items: [{ id: 'a', title: 'a', sourceType: 'file', value: 'C:\\a.mp4' }] }))).toBe('视频')
      expect(playlistKindLabel(playlist({ items: [{ id: 'a', title: 'a', sourceType: 'm3u8', value: 'x.m3u8' }] }))).toBe('流')
      expect(playlistKindLabel(playlist({ items: [{ id: 'a', title: 'a', sourceType: 'flv', value: 'x.flv' }] }))).toBe('流')
    })
  })
})
