import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanMediaFolder } from '../mediaService'

describe('scanMediaFolder', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vh-test-'))
    writeFileSync(join(dir, 'a.mp4'), '')
    writeFileSync(join(dir, 'b.WEBM'), '')
    writeFileSync(join(dir, 'live.m3u8'), '')
    writeFileSync(join(dir, 'c.flv'), '')
    writeFileSync(join(dir, 'readme.txt'), '')
    mkdirSync(join(dir, 'subdir'))
  })

  it('只返回受支持扩展名的媒体文件，忽略目录与其他文件', async () => {
    const items = await scanMediaFolder(dir)
    const values = items.map((i) => i.value)
    expect(values).toContain(join(dir, 'a.mp4'))
    expect(values).toContain(join(dir, 'b.WEBM'))
    expect(values).toContain(join(dir, 'live.m3u8'))
    expect(values).toContain(join(dir, 'c.flv'))
    expect(values).not.toContain(join(dir, 'readme.txt'))
    expect(values).not.toContain(join(dir, 'subdir'))
  })

  it('生成带标题与正确 sourceType 的 MediaItem', async () => {
    const items = await scanMediaFolder(dir)
    const a = items.find((i) => i.value.endsWith('a.mp4'))
    expect(a?.title).toBe('a')
    expect(a?.sourceType).toBe('file')
    const live = items.find((i) => i.value.endsWith('live.m3u8'))
    expect(live?.sourceType).toBe('m3u8')
  })

  it('每个 item 写入 createdAt（时间排序依据）', async () => {
    const items = await scanMediaFolder(dir)
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item.createdAt).toBeDefined()
      expect(item.createdAt!).toBeLessThanOrEqual(Date.now())
    }
  })

  it('目录不存在返回空数组', async () => {
    await expect(scanMediaFolder(join(dir, 'not-exist'))).resolves.toEqual([])
  })
})
