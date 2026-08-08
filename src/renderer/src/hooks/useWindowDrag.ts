import { useEffect, useRef } from 'react'

interface DragOffset {
  x: number
  y: number
}

/**
 * 窗口拖拽：CSS -webkit-app-region: drag 的 JS 兜底。
 * 若 app-region 生效，系统拦截鼠标事件，本逻辑不触发；若失效，由本逻辑接管移动窗口。
 */
export function useWindowDrag(): { onMouseDown: (e: React.MouseEvent<HTMLElement>) => void } {
  const draggingRef = useRef(false)
  const offsetRef = useRef<DragOffset>({ x: 0, y: 0 })

  useEffect(() => {
    const onMouseMove = (e: MouseEvent): void => {
      if (!draggingRef.current) return
      void window.api.window.moveTo(e.screenX - offsetRef.current.x, e.screenY - offsetRef.current.y)
    }
    const onMouseUp = (): void => {
      draggingRef.current = false
    }
    const onBlur = (): void => {
      draggingRef.current = false
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const onMouseDown = (e: React.MouseEvent<HTMLElement>): void => {
    if (e.button !== 0) return
    void window.api.window.getState().then((s) => {
      offsetRef.current = { x: e.screenX - s.bounds.x, y: e.screenY - s.bounds.y }
      draggingRef.current = true
    })
  }

  return { onMouseDown }
}
