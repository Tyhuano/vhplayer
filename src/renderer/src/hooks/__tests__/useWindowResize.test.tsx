import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWindowResize } from '../useWindowResize'

function ResizeProbe(): React.JSX.Element {
  const { onMouseDown } = useWindowResize()
  return <div id="handle" onMouseDown={onMouseDown} />
}

describe('useWindowResize', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    ;(window.api.window.resizeTo as jest.Mock).mockClear()
    act(() => {
      root = createRoot(container)
      root.render(<ResizeProbe />)
    })
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
      root = null
      container.remove()
    })
  })

  function handleEl(): HTMLElement {
    return container.querySelector('#handle') as HTMLElement
  }

  it('左键按下后 mousemove 按屏幕坐标换算调用 resizeTo', async () => {
    handleEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, screenX: 900, screenY: 500 }))
    await act(async () => {})
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, screenX: 1200, screenY: 700 }))
    expect(window.api.window.resizeTo).toHaveBeenCalledWith(0, 0, 1200, 700)
  })

  it('尺寸不小于最小约束（480x320）', async () => {
    handleEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, screenX: 900, screenY: 500 }))
    await act(async () => {})
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, screenX: 200, screenY: 150 }))
    expect(window.api.window.resizeTo).toHaveBeenCalledWith(0, 0, 480, 320)
  })

  it('松开鼠标后不再调整', async () => {
    handleEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, screenX: 900, screenY: 500 }))
    await act(async () => {})
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, screenX: 1500, screenY: 900 }))
    expect(window.api.window.resizeTo).not.toHaveBeenCalled()
  })
})
