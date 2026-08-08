import { createMemoryBackend, StoreService } from '../storeService'
import type { Playlist, PlayerInstance, Settings } from '../../shared/types'

describe('StoreService', () => {
  function createService(): { service: StoreService; backend: ReturnType<typeof createMemoryBackend> } {
    const backend = createMemoryBackend()
    return { service: new StoreService(backend), backend }
  }

  it('未写入时返回默认值', () => {
    const { service } = createService()
    expect(service.getPlaylists()).toEqual([])
    expect(service.getSettings()).toEqual({ downloadDir: '', autoResume: true })
    expect(service.getInstances()).toHaveLength(4)
  })

  it('playlists round-trip', () => {
    const { service } = createService()
    const playlists: Playlist[] = [
      {
        id: 'p1',
        name: '测试列表',
        items: [{ id: 'm1', title: '视频一', sourceType: 'm3u8', value: 'https://example.com/a.m3u8', lastPosition: 12.5 }],
        createdAt: 1723000000000
      }
    ]
    service.savePlaylists(playlists)
    expect(service.getPlaylists()).toEqual(playlists)
  })

  it('favorites round-trip', () => {
    const { service } = createService()
    const fav: Playlist = {
      id: 'favorites',
      name: '收藏',
      items: [{ id: 'f1', title: '喜欢', sourceType: 'url', value: 'https://example.com/v.mp4' }],
      createdAt: 1723000000000
    }
    service.saveFavorites(fav)
    expect(service.getFavorites()).toEqual(fav)
  })

  it('settings round-trip', () => {
    const { service } = createService()
    const settings: Settings = { downloadDir: 'D:/download', autoResume: false }
    service.saveSettings(settings)
    expect(service.getSettings()).toEqual(settings)
  })

  it('instances round-trip（含独立音量/倍速/模式）', () => {
    const { service } = createService()
    const instances: PlayerInstance[] = [0, 1, 2, 3].map(
      (id): PlayerInstance => ({
        id,
        playlistId: id === 0 ? 'p1' : null,
        currentIndex: id,
        playMode: id === 2 ? 'random' : 'order',
        isPlaying: false,
        volume: id === 0 ? 0.5 : 1,
        rate: id === 1 ? 1.5 : 1,
        scaleMode: 'contain'
      })
    )
    service.saveInstances(instances)
    expect(service.getInstances()).toEqual(instances)
  })

  it('重复 save 覆盖旧值，不累积', () => {
    const { service } = createService()
    service.savePlaylists([{ id: 'a', name: 'A', items: [], createdAt: 1 }])
    service.savePlaylists([{ id: 'b', name: 'B', items: [], createdAt: 2 }])
    expect(service.getPlaylists()).toEqual([{ id: 'b', name: 'B', items: [], createdAt: 2 }])
  })

  it('saveAll/getAll 快照 round-trip', () => {
    const { service } = createService()
    const snapshot = {
      playlists: [
        { id: 'p1', name: '列表', items: [{ id: 'm1', title: '一', sourceType: 'file' as const, value: 'C:\\a.mp4' }], createdAt: 1 }
      ],
      favorites: { id: 'favorites', name: '收藏', items: [{ id: 'f1', title: '爱', sourceType: 'url' as const, value: 'https://x.com/v.mp4' }], createdAt: 2 },
      settings: { downloadDir: 'D:/d', autoResume: false },
      instances: [0, 1, 2, 3].map((id) => ({ id, playlistId: null, currentIndex: 0, playMode: 'order' as const, isPlaying: false, volume: 1, rate: 1, scaleMode: 'contain' as const }))
    }
    service.saveAll(snapshot)
    expect(service.getAll()).toEqual(snapshot)
  })
})
