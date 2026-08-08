Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: jest.fn(() => Promise.resolve())
})
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: jest.fn()
})
Object.defineProperty(HTMLMediaElement.prototype, 'load', {
  configurable: true,
  value: jest.fn()
})
Object.defineProperty(HTMLMediaElement.prototype, 'canPlayType', {
  configurable: true,
  value: jest.fn(() => 'maybe')
})
Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
  configurable: true,
  get: () => 0,
  set: () => {}
})

Object.defineProperty(window, 'api', {
  configurable: true,
  value: {
    window: {
      enterFullscreen: jest.fn(),
      exitFullscreen: jest.fn(),
      toggleFullscreen: jest.fn(),
      enterMini: jest.fn(),
      exitMini: jest.fn(),
      getState: jest.fn(() => Promise.resolve({ mode: 'window', bounds: { x: 0, y: 0, width: 960, height: 540 } }))
    },
    dialog: { openFolder: jest.fn(), openFile: jest.fn(), save: jest.fn() },
    store: { getAll: jest.fn(), saveAll: jest.fn(() => Promise.resolve()) },
    media: { scanFolder: jest.fn(() => Promise.resolve([])) },
    app: { onClosing: jest.fn(() => () => {}), readyToClose: jest.fn(() => Promise.resolve()) }
  }
})
