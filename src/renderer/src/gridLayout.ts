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

/** 分屏最小舒适宽度：每格至少 480 宽，2 列共 960（自适应基准，非硬性最小限制） */
const MIN_GRID_W = 960

/**
 * 计算进入分屏后的窗口 bounds：
 * - 取 4 槽位中有效视频尺寸的宽高比平均值（规格：取平均，无有效值则不动窗口）
 * - 宽度 = max(当前窗口宽, 960)：小窗口进入分屏时放大保证每格 ≥480 可完整显示；
 *   大窗口保持用户宽度心智
 * - 高度 = 宽 / 平均宽高比（2x2 网格中每格宽高比 = 窗口宽高比，contain 下无额外黑边）
 * - screen 提供时钳制到工作区 95%（先高后宽，保持比例），避免极端比例高度爆屏
 * - 无最小尺寸下限（取消最小限制，小窗口由渲染进程紧凑模式接管 UI）
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
  let width = Math.max(current.width, MIN_GRID_W)
  let height = Math.max(1, Math.round(width / avgRatio))
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
  return { x: current.x, y: current.y, width: Math.max(1, width), height: Math.max(1, height) }
}
