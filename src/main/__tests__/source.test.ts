import {
  extensionOf,
  guessSourceType,
  isFileSource,
  titleFromPath,
  toFileUrl,
  uid
} from '../../shared/source'

describe('source 工具', () => {
  it('extensionOf 提取小写扩展名', () => {
    expect(extensionOf('C:\\v\\a.MP4')).toBe('mp4')
    expect(extensionOf('D:/x/y.webm')).toBe('webm')
    expect(extensionOf('https://x.com/live.m3u8?token=1')).toBe('m3u8')
    expect(extensionOf('noext')).toBe('')
  })

  it('isFileSource 识别 Windows 路径与 file:// 前缀', () => {
    expect(isFileSource('C:\\v\\a.mp4')).toBe(true)
    expect(isFileSource('D:/x/a.mp4')).toBe(true)
    expect(isFileSource('file:///C:/x/a.mp4')).toBe(true)
    expect(isFileSource('https://x.com/a.mp4')).toBe(false)
  })

  it('guessSourceType 按 m3u8/flv/本地/直链 判定', () => {
    expect(guessSourceType('https://x.com/live.m3u8')).toBe('m3u8')
    expect(guessSourceType('https://x.com/s.m3u8?token=1')).toBe('m3u8')
    expect(guessSourceType('C:\\v\\s.m3u8')).toBe('m3u8')
    expect(guessSourceType('https://x.com/l.flv')).toBe('flv')
    expect(guessSourceType('C:\\v\\a.mp4')).toBe('file')
    expect(guessSourceType('D:/x/a.webm')).toBe('file')
    expect(guessSourceType('https://x.com/v.mp4')).toBe('url')
  })

  it('titleFromPath 取文件名去扩展名', () => {
    expect(titleFromPath('C:\\v\\My Video.mp4')).toBe('My Video')
    expect(titleFromPath('D:/x/a.b.c.webm')).toBe('a.b.c')
  })

  it('toFileUrl 转换 Windows 路径并保留 vh:// 原样', () => {
    expect(toFileUrl('C:\\v\\a.mp4')).toBe('vh://local/C:/v/a.mp4')
    expect(toFileUrl('D:/x/a.mp4')).toBe('vh://local/D:/x/a.mp4')
    expect(toFileUrl('vh://local/C:/x/a.mp4')).toBe('vh://local/C:/x/a.mp4')
  })

  it('uid 生成唯一值', () => {
    expect(uid()).not.toBe(uid())
  })
})
