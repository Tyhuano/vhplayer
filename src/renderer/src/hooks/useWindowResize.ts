import { useEffect, useRef } from 'react'

interface ResizeStart {
  winX: number
  winY: number
}

/**
 * 窗口右下角缩放手柄（纯 JS 实现）。
 * resizable: false 后系统缩放热区消失，缩放统一由本手柄经 resizeTo IPC 完成。
 * 使用 Pointer Events + setPointerCapture：按住手柄后鼠标拖出窗口，
 * pointermove 仍持续派发到被捕获元素——否则向窗外放大时事件丢失，
 * 窗口会卡在鼠标移出窗口瞬间的尺寸。
 * 无最小尺寸限制（窗口可任意缩小，小窗口由紧凑模式接管 UI）。
 */
export function useWindowResize(): { onPointerDown: (e: React.PointerEvent<HTMLElement>) => void } {
  const resizingRef = useRef(false)
  const startRef = useRef<ResizeStart | null>(null)

  useEffect(() => {
    const onPointerMove = (e: PointerEvent): void => {
      const start = startRef.current
      if (!resizingRef.current || !start) return
      void window.api.window.resizeTo(
        start.winX,
        start.winY,
        Math.max(1, Math.round(e.screenX - start.winX)),
        Math.max(1, Math.round(e.screenY - start.winY))
      )
    }
    const onPointerUp = (): void => {
      resizingRef.current = false
      startRef.current = null
    }
    const onBlur = (): void => {
      resizingRef.current = false
    }
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLElement>): void => {
    if (e.button !== 0) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // 环境不支持 pointer capture 时静默降级（窗口内拖拽仍有效）
    }
    void window.api.window.getState().then((s) => {
      startRef.current = { winX: s.bounds.x, winY: s.bounds.y }
      resizingRef.current = true
    })
  }

  return { onPointerDown }
}
