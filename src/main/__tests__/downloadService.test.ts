import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DownloadService,
  parseTimeFromLine,
  sanitizeFileName,
  resolveOutPath,
  type SpawnLike
} from '../downloadService'
import type { MediaItem } from '../../shared/types'

function makeItem(value = 'https://example.com/live.m3u8', title = '测试视频'): MediaItem {
  return { id: 'm1', title, sourceType: 'm3u8', value }
}

interface FakeSpawnRec {
  kill: jest.Mock
  stderrOn: jest.Mock
  closeCb: ((code: number | null) => void) | null
}

function makeSpawnFn(): {
  spawnFn: (cmd: string, args: string[]) => SpawnLike
  recs: FakeSpawnRec[]
  calls: Array<{ cmd: string; args: string[] }>
} {
  const recs: FakeSpawnRec[] = []
  const calls: Array<{ cmd: string; args: string[] }> = []
  const spawnFn = (cmd: string, args: string[]): SpawnLike => {
    calls.push({ cmd, args })
    const rec: FakeSpawnRec = {
      kill: jest.fn(() => true),
      stderrOn: jest.fn(),
      closeCb: null
    }
    recs.push(rec)
    return {
      kill: () => rec.kill(),
      stderr: {
        on: (_event, cb: (chunk: Buffer) => void) => {
          rec.stderrOn(cb)
        }
      },
      on: (_event, cb: (code: number | null) => void) => {
        rec.closeCb = cb
      }
    }
  }
  return { spawnFn, recs, calls }
}

describe('纯函数', () => {
  it('parseTimeFromLine 解析 HH:MM:SS.mmm', () => {
    expect(parseTimeFromLine('frame= 10 fps=0.0 q=-1.0 size= 100kB time=00:01:23.45')).toBe(83.45)
    expect(parseTimeFromLine('time=00:00:59')).toBe(59)
    expect(parseTimeFromLine('no time here')).toBeNull()
    expect(parseTimeFromLine('time=00:01:23.45 时间戳 第二次 time=00:02:00.00')).toBe(120)
  })

  it('sanitizeFileName 清理非法字符，空结果回退 download', () => {
    expect(sanitizeFileName('a/b:c*d?e"f<g>h|i')).toBe('a b c d e f g h i')
    expect(sanitizeFileName('  你好 视频  ')).toBe('你好 视频')
    expect(sanitizeFileName('///')).toBe('download')
  })

  it('resolveOutPath 冲突时追加 (n) 后缀', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vh-dl-'))
    const first = resolveOutPath(dir, '影片')
    writeFileSync(first, 'x')
    const second = resolveOutPath(dir, '影片')
    expect(second).toBe(join(dir, '影片 (1).mp4'))
    expect(resolveOutPath(dir, '影片')).toBe(join(dir, '影片 (1).mp4'))
  })
})

describe('DownloadService', () => {
  it('无 ffmpeg 二进制 → start 返回 null（兜底）', () => {
    const svc = new DownloadService({ ffmpegPath: null, spawnFn: () => { throw new Error('不该调用') } })
    expect(svc.hasFfmpeg()).toBe(false)
    expect(svc.start(makeItem(), 'C:\\tmp')).toBeNull()
  })

  it('串行队列：第二个任务排队，第一个结束后第二个才运行', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    const t1 = svc.start(makeItem('https://a.com/1.m3u8', '一'), 'C:\\tmp')
    const t2 = svc.start(makeItem('https://a.com/2.m3u8', '二'), 'C:\\tmp')
    expect(t1?.status).toBe('running')
    expect(t2?.status).toBe('queued')
    expect(svc.getTasks().map((t) => t.id)).toEqual([t1?.id, t2?.id])
    expect(recs).toHaveLength(1)
    recs[0].closeCb?.(0)
    expect(t2?.status).toBe('running')
    expect(recs).toHaveLength(2)
    recs[1].closeCb?.(0)
    expect(t1?.status).toBe('done')
    expect(t2?.status).toBe('done')
    expect(t1?.progress).toBe(1)
  })

  it('spawn 参数为 -y -i <url> -c copy <out.mp4>', () => {
    const { spawnFn, calls } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    svc.start(makeItem('https://a.com/1.m3u8', '一'), 'C:\\tmp')
    expect(calls[0]).toEqual({
      cmd: 'C:\\ffmpeg.exe',
      args: ['-y', '-i', 'https://a.com/1.m3u8', '-c', 'copy', 'C:\\tmp\\一.mp4']
    })
  })

  it('有 duration 时按 time= 推进度（0-0.999）', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    const t = svc.start(makeItem(), 'C:\\tmp', 100)
    const cb = recs[0].stderrOn.mock.calls[0][0] as (chunk: Buffer) => void
    cb(Buffer.from('time=00:00:50.00'))
    expect(t?.progress).toBeCloseTo(0.5)
    cb(Buffer.from('time=00:02:00.00'))
    expect(t?.progress).toBeCloseTo(0.999)
  })

  it('无 duration 时 progress 保持 0', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    const t = svc.start(makeItem(), 'C:\\tmp')
    const cb = recs[0].stderrOn.mock.calls[0][0] as (chunk: Buffer) => void
    cb(Buffer.from('time=00:01:00.00'))
    expect(t?.progress).toBe(0)
  })

  it('失败（exit≠0）→ status error 且记录 stderr 尾部', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    const t = svc.start(makeItem(), 'C:\\tmp')
    const cb = recs[0].stderrOn.mock.calls[0][0] as (chunk: Buffer) => void
    cb(Buffer.from('https://a.com/1.m3u8: Invalid data found\n'))
    cb(Buffer.from('Connection reset by peer\n'))
    recs[0].closeCb?.(1)
    expect(t?.status).toBe('error')
    expect(t?.error).toContain('Connection reset')
  })

  it('取消 queued 任务：从列表移除且不启动', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    svc.start(makeItem(), 'C:\\tmp')
    const t2 = svc.start(makeItem('https://b.com/2.m3u8', '二'), 'C:\\tmp')
    svc.cancel(t2!.id)
    expect(svc.getTasks().map((t) => t.id)).not.toContain(t2!.id)
    expect(recs).toHaveLength(1)
  })

  it('取消 running 任务：kill 子进程，close 后移除并删除半成品', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    const t = svc.start(makeItem(), 'C:\\tmp')
    svc.cancel(t!.id)
    expect(recs[0].kill).toHaveBeenCalled()
    recs[0].closeCb?.(null)
    expect(svc.getTasks()).toEqual([])
  })

  it('dismiss 移除 done/error 任务（running 忽略）', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    const t = svc.start(makeItem(), 'C:\\tmp')
    recs[0].closeCb?.(0)
    svc.dismiss(t!.id)
    expect(svc.getTasks()).toEqual([])
  })

  it('notify 在状态变化时回调（含进度与完成）', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const notify = jest.fn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn, notify })
    const t = svc.start(makeItem(), 'C:\\tmp', 100)
    const cb = recs[0].stderrOn.mock.calls[0][0] as (chunk: Buffer) => void
    cb(Buffer.from('time=00:00:10.00'))
    recs[0].closeCb?.(0)
    expect(notify).toHaveBeenCalled()
    expect(t?.status).toBe('done')
  })

  it('shutdown：kill 活动子进程、清空队列', () => {
    const { spawnFn, recs } = makeSpawnFn()
    const svc = new DownloadService({ ffmpegPath: 'C:\\ffmpeg.exe', spawnFn })
    svc.start(makeItem(), 'C:\\tmp')
    svc.start(makeItem('https://b.com/2.m3u8', '二'), 'C:\\tmp')
    svc.shutdown()
    expect(recs[0].kill).toHaveBeenCalled()
    expect(svc.getTasks()).toEqual([])
  })
})
