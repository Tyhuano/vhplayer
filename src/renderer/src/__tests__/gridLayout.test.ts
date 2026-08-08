import { computeGridBounds } from '../gridLayout'

describe('computeGridBounds', () => {
  const cur = { x: 100, y: 50, width: 960, height: 540 }

  it('无有效尺寸 → null（保持当前窗口不调整）', () => {
    expect(computeGridBounds([null, null, null, null], cur)).toBeNull()
    expect(computeGridBounds([{ w: 0, h: 0 }, null, { w: -1, h: 2 }, null], cur)).toBeNull()
  })

  it('单个 16:9 → 宽保持当前，高 = 宽/比例', () => {
    expect(computeGridBounds([{ w: 1920, h: 1080 }, null, null, null], cur)).toEqual({
      x: 100,
      y: 50,
      width: 960,
      height: 540
    })
  })

  it('多个尺寸取宽高比平均值', () => {
    // (16/9 + 4/3) / 2 = 1.5555… → 高 = round(960 / 1.5555…) = 617
    expect(computeGridBounds([{ w: 1920, h: 1080 }, { w: 640, h: 480 }, null, null], cur)).toEqual({
      x: 100,
      y: 50,
      width: 960,
      height: 617
    })
  })

  it('位置与宽度保持当前窗口', () => {
    const r = computeGridBounds([{ w: 1920, h: 1080 }, null, null, null], { x: 10, y: 20, width: 800, height: 600 })
    expect(r).toEqual({ x: 10, y: 20, width: 800, height: 450 })
  })
})
