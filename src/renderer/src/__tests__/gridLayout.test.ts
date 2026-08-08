import { computeGridBounds } from '../gridLayout'

describe('computeGridBounds', () => {
  const cur = { x: 100, y: 50, width: 960, height: 540 }
  const screen = { w: 1536, h: 864 }

  it('无有效尺寸 → null（保持当前窗口不调整）', () => {
    expect(computeGridBounds([null, null, null, null], cur)).toBeNull()
    expect(computeGridBounds([{ w: 0, h: 0 }, null, { w: -1, h: 2 }, null], cur)).toBeNull()
  })

  it('16:9 视频 + 16:9 窗口 → 宽高不变', () => {
    expect(computeGridBounds([{ w: 1920, h: 1080 }, null, null, null], cur)).toEqual({
      x: 100,
      y: 50,
      width: 960,
      height: 540
    })
  })

  it('4:3 视频 → 宽保持 960，高 = 960/4:3 = 720（每格 480×360 完整显示）', () => {
    expect(computeGridBounds([{ w: 640, h: 480 }, null, null, null], cur)).toEqual({
      x: 100,
      y: 50,
      width: 960,
      height: 720
    })
  })

  it('小窗口（500 宽）进入分屏 → 放大到 960 宽保证每格 ≥480', () => {
    const small = { x: 0, y: 0, width: 500, height: 380 }
    const r = computeGridBounds([{ w: 1920, h: 1080 }, null, null, null], small)
    expect(r).toEqual({ x: 0, y: 0, width: 960, height: 540 })
  })

  it('大窗口保持当前宽度', () => {
    const big = { x: 0, y: 0, width: 1600, height: 900 }
    const r = computeGridBounds([{ w: 1920, h: 1080 }, null, null, null], big)
    expect(r).toEqual({ x: 0, y: 0, width: 1600, height: 900 })
  })

  it('多个尺寸取宽高比平均值', () => {
    // R = (16/9 + 4/3)/2 = 1.5555…，宽 960 → 高 = round(960/1.5555…) = 617
    const r = computeGridBounds([{ w: 1920, h: 1080 }, { w: 640, h: 480 }, null, null], cur)
    expect(r).toEqual({ x: 100, y: 50, width: 960, height: 617 })
  })

  it('位置保持当前窗口', () => {
    const r = computeGridBounds([{ w: 1920, h: 1080 }, null, null, null], { x: 10, y: 20, width: 800, height: 600 })
    expect(r?.x).toBe(10)
    expect(r?.y).toBe(20)
  })

  it('竖屏 9:16 视频 → 高度钳制到工作区 95%、宽度随之回缩并保下限 480', () => {
    // 宽 960 → 高 = 960/0.5625 = 1706 → 钳 maxH = 821 → W = 821×9/16 = 461.8 → 462 → 下限 480
    const r = computeGridBounds([{ w: 1080, h: 1920 }, null, null, null], cur, screen)
    expect(r).toEqual({ x: 100, y: 50, width: 480, height: 821 })
  })

  it('极宽 21:9 视频不超屏幕宽度', () => {
    // R = 21/9 = 2.333…，宽 960 → 高 = 411；maxW = 1459、maxH = 821：均未超
    const r = computeGridBounds([{ w: 3360, h: 1440 }, null, null, null], cur, screen)
    expect(r).toEqual({ x: 100, y: 50, width: 960, height: 411 })
  })

  it('screen 钳制下限 480x320', () => {
    const tiny = { x: 0, y: 0, width: 480, height: 320 }
    const r = computeGridBounds([{ w: 1080, h: 1920 }, null, null, null], tiny, screen)
    expect(r?.width).toBeGreaterThanOrEqual(480)
    expect(r?.height).toBeGreaterThanOrEqual(320)
  })
})
