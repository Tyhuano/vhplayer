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
