import { useEffect, useRef } from 'react'

interface DragOffset {
  x: number
  y: number
}

/**
 * 窗口拖拽（纯 JS 实现，不依赖 -webkit-app-region）：
 * - mousedown 记录鼠标与窗口偏移，mousemove 经 moveTo IPC 移动窗口
 * - 顶部 8px 内为系统窗口缩放热区，跳过以免与系统 resize 叠加
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
    if (e.clientY < 8) return
    void window.api.window.getState().then((s) => {
      offsetRef.current = { x: e.screenX - s.bounds.x, y: e.screenY - s.bounds.y }
      draggingRef.current = true
    })
  }

  return { onMouseDown }
}
