export type WindowMode = 'window' | 'fullscreen' | 'mini'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowLike {
  setFullScreen(flag: boolean): void
  setAlwaysOnTop(flag: boolean): void
  setBounds(bounds: Rect): void
  getBounds(): Rect
}

export interface WindowState {
  mode: WindowMode
  bounds: Rect
}

const MINI_WIDTH = 420
const MINI_MIN_HEIGHT = 280

export class WindowManager {
  private mode: WindowMode = 'window'
  private windowBounds: Rect | null = null

  constructor(private readonly win: WindowLike) {}

  getState(): WindowState {
    return {
      mode: this.mode,
      bounds: this.mode === 'fullscreen' && this.windowBounds ? this.windowBounds : this.win.getBounds()
    }
  }

  enterFullscreen(): void {
    if (this.mode === 'fullscreen') return
    this.safe(() => {
      if (this.mode === 'window') this.windowBounds = this.win.getBounds()
      this.win.setFullScreen(true)
      this.mode = 'fullscreen'
    })
  }

  exitFullscreen(): void {
    if (this.mode !== 'fullscreen') return
    this.safe(() => {
      this.win.setFullScreen(false)
      if (this.windowBounds) this.win.setBounds(this.windowBounds)
      this.mode = 'window'
    })
  }

  toggleFullscreen(): void {
    if (this.mode === 'fullscreen') this.exitFullscreen()
    else this.enterFullscreen()
  }

  enterMini(): void {
    if (this.mode === 'mini') return
    this.safe(() => {
      if (this.mode === 'fullscreen') {
        this.win.setFullScreen(false)
      }
      if (!this.windowBounds) this.windowBounds = this.win.getBounds()
      const base = this.windowBounds
      const targetWidth = MINI_WIDTH
      let targetHeight = Math.round((targetWidth * base.height) / base.width)
      let width = targetWidth
      if (targetHeight < MINI_MIN_HEIGHT) {
        targetHeight = MINI_MIN_HEIGHT
        width = Math.round((targetHeight * base.width) / base.height)
      }
      const cx = base.x + base.width / 2
      const cy = base.y + base.height / 2
      this.win.setBounds({
        x: Math.round(cx - width / 2),
        y: Math.round(cy - targetHeight / 2),
        width,
        height: targetHeight
      })
      this.win.setAlwaysOnTop(true)
      this.mode = 'mini'
    })
  }

  exitMini(): void {
    if (this.mode !== 'mini') return
    this.safe(() => {
      this.win.setAlwaysOnTop(false)
      if (this.windowBounds) this.win.setBounds(this.windowBounds)
      this.windowBounds = null
      this.mode = 'window'
    })
  }

  private safe(action: () => void): void {
    try {
      action()
    } catch {
      this.mode = 'window'
    }
  }
}
