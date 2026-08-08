import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  )
}

export function useShortcuts(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return
      const state = useAppStore.getState()
      const instanceId = state.activeInstance
      const key = event.key
      const video = state.videoRegistry[instanceId] ?? null

      switch (key) {
        case ' ':
          event.preventDefault()
          if (video) {
            if (video.paused) void video.play()
            else video.pause()
          }
          break
        case 'ArrowLeft':
          event.preventDefault()
          if (video) video.currentTime = Math.max(0, video.currentTime - 5)
          break
        case 'ArrowRight':
          event.preventDefault()
          if (video) video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5)
          break
        case 'ArrowUp':
          event.preventDefault()
          state.updateInstance(instanceId, { volume: Math.min(1, state.instances[instanceId].volume + 0.1) })
          break
        case 'ArrowDown':
          event.preventDefault()
          state.updateInstance(instanceId, { volume: Math.max(0, state.instances[instanceId].volume - 0.1) })
          break
        case 'm':
        case 'M':
          if (video) video.muted = !video.muted
          break
        case 'f':
        case 'F':
          void window.api.window.toggleFullscreen()
          break
        case 'p':
        case 'P':
          event.preventDefault()
          void state.toggleMini()
          break
        case 'l':
        case 'L':
          state.togglePanel()
          break
        case 'g':
        case 'G':
          event.preventDefault()
          state.toggleGridMode()
          break
        case 'Escape':
          // 优先级链：右键菜单 → 面板 → 退出全屏/置顶
          if (state.menuOpen) {
            state.closeMenu()
            return
          }
          if (state.panelOpen) {
            state.closePanel()
            return
          }
          void window.api.window.getState().then((s) => {
            if (s.mode === 'fullscreen') void window.api.window.exitFullscreen()
            else if (s.mode === 'mini') void window.api.window.exitMini()
          })
          break
      }
    }
    const onContextMenu = (e: MouseEvent): void => {
      e.preventDefault()
      useAppStore.getState().openMenu(e.clientX, e.clientY)
    }
    window.addEventListener('keydown', handler)
    window.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('contextmenu', onContextMenu)
    }
  }, [])
}
