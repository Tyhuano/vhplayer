import { computeGridBounds } from '../gridLayout'

describe('computeGridBounds', () => {
  const cur = { x: 100, y: 50, width: 960, height: 540 }
  const screen = { w: 1536, h: 864 }

  it('无有效尺寸 → null（保持当前窗口不调整）', () => {
    expect(computeGridBounds([null, null, null, null], cur)).toBeNull()
    expect(computeGridBounds([{ w: 0, h: 0 }, null, { w: -1, h: 2 }, null], cur)).toBeNull()
  })

  it('16:9 视频 + 16:9 窗口（面积守恒）→ 宽高不变', () => {
    // S = 960×540，R = 16/9 → W = sqrt(518400×16/9) = 960，H = 540
    expect(computeGridBounds([{ w: 1920, h: 1080 }, null, null, null], cur)).toEqual({
      x: 100,
      y: 50,
      width: 960,
      height: 540
    })
  })

  it('4:3 视频 → 面积守恒换算为 4:3 窗口（831×623）', () => {
    // S = 518400，R = 4/3 → W = sqrt(518400×4/3) = 831.4 → 831，H = sqrt(518400×3/4) = 623.5 → 624？
    // 精确计算：sqrt(691200) = 831.38 → 831；sqrt(388800) = 623.54 → 624
    const r = computeGridBounds([{ w: 640, h: 480 }, null, null, null], cur)
    expect(r?.width).toBe(831)
    expect(r?.height).toBe(624)
  })

  it('多个尺寸取宽高比平均值', () => {
    // R = (16/9 + 4/3)/2 = 1.5555…，S = 518400
    // W = sqrt(518400×1.5555…) = 898.1 → 898，H = sqrt(518400/1.5555…) = 577.3 → 577
    const r = computeGridBounds([{ w: 1920, h: 1080 }, { w: 640, h: 480 }, null, null], cur)
    expect(r).toEqual({ x: 100, y: 50, width: 898, height: 577 })
  })

  it('位置保持当前窗口', () => {
    const r = computeGridBounds([{ w: 1920, h: 1080 }, null, null, null], { x: 10, y: 20, width: 800, height: 600 })
    expect(r?.x).toBe(10)
    expect(r?.y).toBe(20)
  })

  it('竖屏 9:16 视频 → 竖窗口，高度钳制到工作区 95%、宽度保下限 480', () => {
    // 面积守恒：W = sqrt(518400×9/16) = 540，H = sqrt(518400×16/9) = 960
    // 钳制：maxH = 820.8 → 821；W = 821×9/16 = 461.8 → 462 → 下限 480
    const r = computeGridBounds([{ w: 1080, h: 1920 }, null, null, null], cur, screen)
    expect(r).toEqual({ x: 100, y: 50, width: 480, height: 821 })
  })

  it('宽高双超限 → 高度优先钳制后宽度随之（仍可能超宽则二次钳制）', () => {
    // 极宽视频 21:9：R = 2.333，W = sqrt(518400×2.333) = 1100，H = sqrt(518400/2.333) = 471
    // maxW = 1459.2 → 1459、maxH = 820.8 → 821：都未超，无需钳制
    const r = computeGridBounds([{ w: 3360, h: 1440 }, null, null, null], cur, screen)
    expect(r?.width).toBe(1100)
    expect(r?.height).toBe(471)
  })

  it('screen 钳制下限 480x320', () => {
    // 极小面积窗口 + 极端比例仍不低于下限
    const tiny = { x: 0, y: 0, width: 480, height: 320 }
    const r = computeGridBounds([{ w: 1080, h: 1920 }, null, null, null], tiny, screen)
    expect(r?.width).toBeGreaterThanOrEqual(480)
    expect(r?.height).toBeGreaterThanOrEqual(320)
  })
})
