import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWindowResize } from '../useWindowResize'

function ResizeProbe(): React.JSX.Element {
  const { onPointerDown } = useWindowResize()
  return <div id="handle" onPointerDown={onPointerDown} />
}

// jsdom 未实现 PointerEvent，用 MouseEvent 派生（携带 pointerId）模拟 pointer 事件
class PointerEventMock extends MouseEvent {
  pointerId: number
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 0
  }
}

describe('useWindowResize', () => {
  let container: HTMLDivElement
  let root: Root | null = null
  let captureSpy: jest.SpyInstance

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    ;(window.api.window.resizeTo as jest.Mock).mockClear()
    // jsdom 未实现 pointer capture，注入 stub 以便验证调用
    if (!('setPointerCapture' in Element.prototype)) {
      Object.defineProperty(Element.prototype, 'setPointerCapture', {
        configurable: true,
        value: jest.fn()
      })
    }
    captureSpy = jest.spyOn(Element.prototype, 'setPointerCapture').mockImplementation(() => {})
    act(() => {
      root = createRoot(container)
      root.render(<ResizeProbe />)
    })
  })

  afterEach(() => {
    captureSpy.mockRestore()
    act(() => {
      root?.unmount()
      root = null
      container.remove()
    })
  })

  function handleEl(): HTMLElement {
    return container.querySelector('#handle') as HTMLElement
  }

  function pressHandle(): void {
    handleEl().dispatchEvent(
      new PointerEventMock('pointerdown', { bubbles: true, button: 0, pointerId: 1, screenX: 900, screenY: 500 })
    )
  }

  it('左键按下后 pointermove 按屏幕坐标换算调用 resizeTo', async () => {
    pressHandle()
    await act(async () => {})
    document.dispatchEvent(
      new PointerEventMock('pointermove', { bubbles: true, pointerId: 1, screenX: 1200, screenY: 700 })
    )
    expect(window.api.window.resizeTo).toHaveBeenCalledWith(0, 0, 1200, 700)
  })

  it('按下时 setPointerCapture（鼠标拖出窗口后事件仍持续派发，窗口可向窗外放大）', async () => {
    pressHandle()
    expect(captureSpy).toHaveBeenCalledWith(1)
    await act(async () => {})
    document.dispatchEvent(
      new PointerEventMock('pointermove', { bubbles: true, pointerId: 1, screenX: 1500, screenY: 900 })
    )
    expect(window.api.window.resizeTo).toHaveBeenCalledWith(0, 0, 1500, 900)
  })

  it('尺寸不小于最小约束（480x320）', async () => {
    pressHandle()
    await act(async () => {})
    document.dispatchEvent(
      new PointerEventMock('pointermove', { bubbles: true, pointerId: 1, screenX: 200, screenY: 150 })
    )
    expect(window.api.window.resizeTo).toHaveBeenCalledWith(0, 0, 480, 320)
  })

  it('松开指针后不再调整', async () => {
    pressHandle()
    await act(async () => {})
    document.dispatchEvent(new PointerEventMock('pointerup', { bubbles: true, pointerId: 1 }))
    document.dispatchEvent(
      new PointerEventMock('pointermove', { bubbles: true, pointerId: 1, screenX: 1500, screenY: 900 })
    )
    expect(window.api.window.resizeTo).not.toHaveBeenCalled()
  })
})
