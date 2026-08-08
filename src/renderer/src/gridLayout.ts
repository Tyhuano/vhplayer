export interface VideoSize {
  w: number
  h: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface ScreenLimit {
  w: number
  h: number
}

const MIN_W = 480
const MIN_H = 320

/**
 * 计算进入分屏后的窗口 bounds：
 * - 取 4 槽位中有效视频尺寸的宽高比平均值（规格：取平均，无有效值则不动窗口）
 * - 面积守恒：以当前窗口面积为基准，按平均宽高比换算宽高（宽 = sqrt(S·R)、高 = sqrt(S/R)），
 *   观感大小不变，且竖屏视频得到竖窗口而非巨高横窗
 * - 2x2 网格中每格宽高比 = 窗口宽高比，contain 下无额外黑边
 * - screen 提供时钳制到工作区 95%（先高后宽，保持比例），避免极端比例高度爆屏
 * - 下限 480x320 与主进程 resizeTo 钳制一致
 * - 返回 null 表示保持当前窗口
 */
export function computeGridBounds(
  sizes: Array<VideoSize | null>,
  current: Rect,
  screen?: ScreenLimit
): Rect | null {
  const valid = sizes.filter((s): s is VideoSize => !!s && s.w > 0 && s.h > 0)
  if (valid.length === 0) return null
  const avgRatio = valid.reduce((sum, s) => sum + s.w / s.h, 0) / valid.length
  const area = current.width * current.height
  let width = Math.max(1, Math.round(Math.sqrt(area * avgRatio)))
  let height = Math.max(1, Math.round(Math.sqrt(area / avgRatio)))
  if (screen && screen.w > 0 && screen.h > 0) {
    const maxW = Math.round(screen.w * 0.95)
    const maxH = Math.round(screen.h * 0.95)
    if (height > maxH) {
      height = maxH
      width = Math.round(height * avgRatio)
    }
    if (width > maxW) {
      width = maxW
      height = Math.round(width / avgRatio)
    }
  }
  return { x: current.x, y: current.y, width: Math.max(MIN_W, width), height: Math.max(MIN_H, height) }
}
