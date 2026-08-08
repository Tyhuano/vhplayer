import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWindowDrag } from '../useWindowDrag'

function DragProbe(): React.JSX.Element {
  const { onMouseDown } = useWindowDrag()
  return <div id="drag" onMouseDown={onMouseDown} />
}

describe('useWindowDrag', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    ;(window.api.window.moveTo as jest.Mock).mockClear()
    act(() => {
      root = createRoot(container)
      root.render(<DragProbe />)
    })
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
      root = null
      container.remove()
    })
  })

  function dragEl(): HTMLElement {
    return container.querySelector('#drag') as HTMLElement
  }

  it('左键按下后 mousemove 按窗口偏移换算调用 moveTo', async () => {
    dragEl().dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 30, screenX: 100, screenY: 80 })
    )
    await act(async () => {})
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, screenX: 300, screenY: 180 }))
    expect(window.api.window.moveTo).toHaveBeenCalledWith(200, 100)
  })

  it('松开鼠标后不再跟随移动', async () => {
    dragEl().dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 30, screenX: 100, screenY: 80 })
    )
    await act(async () => {})
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, screenX: 999, screenY: 999 }))
    expect(window.api.window.moveTo).not.toHaveBeenCalled()
  })

  it('非左键按下不启动拖拽', async () => {
    dragEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2, screenX: 100, screenY: 80 }))
    await act(async () => {})
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, screenX: 300, screenY: 180 }))
    expect(window.api.window.moveTo).not.toHaveBeenCalled()
  })

  it('顶部 8px 内（系统缩放热区）不启动拖拽', async () => {
    dragEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 4, screenX: 100, screenY: 80 }))
    await act(async () => {})
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, screenX: 300, screenY: 180 }))
    expect(window.api.window.moveTo).not.toHaveBeenCalled()
  })
})
