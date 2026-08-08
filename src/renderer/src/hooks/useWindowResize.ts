import { useEffect, useRef } from 'react'

const MIN_WIDTH = 480
const MIN_HEIGHT = 320

interface ResizeStart {
  winX: number
  winY: number
}

/**
 * 窗口右下角缩放手柄（纯 JS 实现）。
 * resizable: false 后系统缩放热区消失，缩放统一由本手柄经 resizeTo IPC 完成。
 */
export function useWindowResize(): { onMouseDown: (e: React.MouseEvent<HTMLElement>) => void } {
  const resizingRef = useRef(false)
  const startRef = useRef<ResizeStart | null>(null)

  useEffect(() => {
    const onMouseMove = (e: MouseEvent): void => {
      const start = startRef.current
      if (!resizingRef.current || !start) return
      void window.api.window.resizeTo(
        start.winX,
        start.winY,
        Math.max(MIN_WIDTH, e.screenX - start.winX),
        Math.max(MIN_HEIGHT, e.screenY - start.winY)
      )
    }
    const onMouseUp = (): void => {
      resizingRef.current = false
      startRef.current = null
    }
    const onBlur = (): void => {
      resizingRef.current = false
    }
    const onMouseLeave = (): void => {
      resizingRef.current = false
      startRef.current = null
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('mouseleave', onMouseLeave)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const onMouseDown = (e: React.MouseEvent<HTMLElement>): void => {
    if (e.button !== 0) return
    void window.api.window.getState().then((s) => {
      startRef.current = { winX: s.bounds.x, winY: s.bounds.y }
      resizingRef.current = true
    })
  }

  return { onMouseDown }
}
