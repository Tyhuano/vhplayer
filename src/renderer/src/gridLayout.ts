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

/**
 * 计算进入分屏后的窗口 bounds：
 * - 取 4 槽位中有效视频尺寸的宽高比平均值（规格：取平均，无有效值则不动窗口）
 * - 新宽 = 当前窗口宽（保持用户宽度心智），新高 = 宽 / 平均宽高比
 * - 2x2 网格中每格宽高比 = 窗口宽高比，contain 下无额外黑边
 * - 返回 null 表示保持当前窗口（由 resizeTo 主进程钳制 min 480x320 / 工作区 1.5 倍兜底）
 */
export function computeGridBounds(sizes: Array<VideoSize | null>, current: Rect): Rect | null {
  const valid = sizes.filter((s): s is VideoSize => !!s && s.w > 0 && s.h > 0)
  if (valid.length === 0) return null
  const avgRatio = valid.reduce((sum, s) => sum + s.w / s.h, 0) / valid.length
  const height = Math.max(1, Math.round(current.width / avgRatio))
  return { x: current.x, y: current.y, width: current.width, height }
}
