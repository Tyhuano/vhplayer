import { WindowManager, type Rect, type WindowLike, type WindowMode } from '../windowManager'

class FakeWindow implements WindowLike {
  alwaysOnTop = false
  private bounds: Rect = { x: 0, y: 0, width: 960, height: 540 }

  setFullScreen(): void {}

  setAlwaysOnTop(flag: boolean): void {
    this.alwaysOnTop = flag
  }

  setBounds(bounds: Rect): void {
    this.bounds = { ...bounds }
  }

  getBounds(): Rect {
    return { ...this.bounds }
  }
}

function createMockWindow(): {
  mock: WindowLike
  calls: { setFullScreen: boolean[]; setAlwaysOnTop: boolean[]; setBounds: unknown[] }
} {
  const calls = { setFullScreen: [] as boolean[], setAlwaysOnTop: [] as boolean[], setBounds: [] as unknown[] }
  const mock: WindowLike = {
    setFullScreen: (flag) => {
      calls.setFullScreen.push(flag)
    },
    setAlwaysOnTop: (flag) => {
      calls.setAlwaysOnTop.push(flag)
    },
    setBounds: (bounds) => {
      calls.setBounds.push(bounds)
    },
    getBounds: () => ({ x: 100, y: 100, width: 960, height: 540 })
  }
  return { mock, calls }
}

describe('WindowManager', () => {
  const modeOf = (wm: WindowManager): WindowMode => wm.getState().mode

  it('初始为 window 模式', () => {
    const { mock } = createMockWindow()
    const wm = new WindowManager(mock)
    expect(modeOf(wm)).toBe('window')
  })

  it('进入全屏只 setFullScreen(true)，不触碰 bounds', () => {
    const { mock, calls } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.enterFullscreen()
    expect(modeOf(wm)).toBe('fullscreen')
    expect(calls.setFullScreen).toEqual([true])
    expect(calls.setBounds).toEqual([])
  })

  it('重复进入全屏是幂等的', () => {
    const { mock, calls } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.enterFullscreen()
    wm.enterFullscreen()
    expect(calls.setFullScreen).toEqual([true])
  })

  it('退出全屏恢复 window 模式并还原 bounds', () => {
    const { mock, calls } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.enterFullscreen()
    wm.exitFullscreen()
    expect(modeOf(wm)).toBe('window')
    expect(calls.setFullScreen).toEqual([true, false])
    expect(calls.setBounds).toEqual([{ x: 100, y: 100, width: 960, height: 540 }])
  })

  it('从 window 进入 mini：记录原 bounds、按比例缩小并置顶', () => {
    const { mock, calls } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.enterMini()
    expect(modeOf(wm)).toBe('mini')
    expect(calls.setAlwaysOnTop).toEqual([true])
    expect(calls.setBounds).toEqual([
      { x: 331, y: 230, width: 498, height: 280 }
    ])
  })

  it('退出 mini：取消置顶并还原原 bounds', () => {
    const { mock, calls } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.enterMini()
    wm.exitMini()
    expect(modeOf(wm)).toBe('window')
    expect(calls.setAlwaysOnTop).toEqual([true, false])
    expect(calls.setBounds).toEqual([
      { x: 331, y: 230, width: 498, height: 280 },
      { x: 100, y: 100, width: 960, height: 540 }
    ])
  })

  it('从全屏进入 mini：先退全屏再缩小', () => {
    const { mock, calls } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.enterFullscreen()
    wm.enterMini()
    expect(modeOf(wm)).toBe('mini')
    expect(calls.setFullScreen).toEqual([true, false])
    expect(calls.setAlwaysOnTop).toEqual([true])
  })

  it('从 mini 退出直接回 window，并还原全屏前记录的 bounds', () => {
    const { mock, calls } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.enterFullscreen()
    wm.enterMini()
    wm.exitMini()
    expect(modeOf(wm)).toBe('window')
    expect(calls.setBounds).toEqual([
      { x: 331, y: 230, width: 498, height: 280 },
      { x: 100, y: 100, width: 960, height: 540 }
    ])
  })

  it('切换形态期间窗口操作抛错时回退 window 模式', () => {
    const failing: WindowLike = {
      setFullScreen: () => {
        throw new Error('boom')
      },
      setAlwaysOnTop: () => {
        throw new Error('boom')
      },
      setBounds: () => {
        throw new Error('boom')
      },
      getBounds: () => ({ x: 0, y: 0, width: 800, height: 450 })
    }
    const wm = new WindowManager(failing)
    wm.enterFullscreen()
    expect(modeOf(wm)).toBe('window')
    wm.enterMini()
    expect(modeOf(wm)).toBe('window')
  })

  it('全屏模式下 getState 返回内部记录的 window bounds', () => {
    const { mock } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.enterFullscreen()
    expect(wm.getState().bounds).toEqual({ x: 100, y: 100, width: 960, height: 540 })
  })

  it('toggleFullscreen 在两种形态间切换', () => {
    const { mock, calls } = createMockWindow()
    const wm = new WindowManager(mock)
    wm.toggleFullscreen()
    expect(modeOf(wm)).toBe('fullscreen')
    wm.toggleFullscreen()
    expect(modeOf(wm)).toBe('window')
    expect(calls.setFullScreen).toEqual([true, false])
  })
})

describe('setPinned（仅置顶，不触碰形态与 bounds）', () => {
  function makeFake(): { fake: FakeWindow; mgr: WindowManager } {
    const fake = new FakeWindow()
    const mgr = new WindowManager(fake)
    return { fake, mgr }
  }

  it('setPinned(true) 仅调 setAlwaysOnTop，不改变 mode 与 bounds', () => {
    const { fake, mgr } = makeFake()
    fake.setBounds({ x: 10, y: 20, width: 800, height: 450 })
    mgr.setPinned(true)
    expect(fake.alwaysOnTop).toBe(true)
    expect(mgr.getState().mode).toBe('window')
    expect(mgr.getState().bounds).toEqual({ x: 10, y: 20, width: 800, height: 450 })
    expect(mgr.getState().pinned).toBe(true)
  })

  it('setPinned(false) 解除置顶', () => {
    const { fake, mgr } = makeFake()
    mgr.setPinned(true)
    mgr.setPinned(false)
    expect(fake.alwaysOnTop).toBe(false)
    expect(mgr.getState().pinned).toBe(false)
  })

  it('置顶状态进入小窗退出后恢复置顶（exitMini 不清除用户置顶）', () => {
    const { fake, mgr } = makeFake()
    mgr.setPinned(true)
    mgr.enterMini()
    expect(fake.alwaysOnTop).toBe(true)
    mgr.exitMini()
    expect(fake.alwaysOnTop).toBe(true)
    expect(mgr.getState().pinned).toBe(true)
  })

  it('未置顶时退出小窗回到非置顶（不残留 alwaysOnTop）', () => {
    const { fake, mgr } = makeFake()
    mgr.enterMini()
    mgr.exitMini()
    expect(fake.alwaysOnTop).toBe(false)
  })
})
