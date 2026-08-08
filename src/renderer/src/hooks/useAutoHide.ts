import { useEffect, useRef, useState } from 'react'

export interface AutoHideHandlers {
  visible: boolean
  onMouseMove: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export function useAutoHide(delayMs = 2500): AutoHideHandlers {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleHide = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), delayMs)
  }

  const show = (): void => {
    setVisible(true)
    scheduleHide()
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return {
    visible,
    onMouseMove: show,
    onMouseEnter: show,
    onMouseLeave: () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setVisible(false)
    }
  }
}
