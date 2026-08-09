// 生成应用图标：科技感设计（深色渐变圆角方块 + 青色发光播放三角 + HUD 弧线）
// 输出 build/icon-512.png、build/icon-256.png、build/icon.ico（内嵌 256 PNG）
const { PNG } = require('pngjs')
const fs = require('fs')
const path = require('path')

const BUILD = path.join(__dirname, '..', 'build')

// 科技感配色
const CYAN = [0, 229, 255, 255] // #00E5FF
const CYAN_DIM = [0, 160, 190, 255]
const BG_TOP = [16, 24, 40, 255] // #101828
const BG_BOTTOM = [7, 11, 22, 255] // #070B16

function inTriangle(px, py, a, b, c) {
  const sign = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3)
  const d1 = sign(px, py, a[0], a[1], b[0], b[1])
  const d2 = sign(px, py, b[0], b[1], c[0], c[1])
  const d3 = sign(px, py, c[0], c[1], a[0], a[1])
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

function inRoundRect(px, py, size) {
  const inset = 16 / 512 * size
  const rad = 110 / 512 * size
  const r = { x: inset, y: inset, w: size - inset * 2, h: size - inset * 2 }
  const cx = px < r.x + rad ? r.x + rad : px > r.x + r.w - rad ? r.x + r.w - rad : px
  const cy = py < r.y + rad ? r.y + rad : py > r.y + r.h - rad ? r.y + r.h - rad : py
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= rad * rad
}

// 距圆角矩形边缘的距离（带符号：内部为正）
function distToRoundRect(px, py, size) {
  const inset = 16 / 512 * size
  const rad = 110 / 512 * size
  const r = { x: inset, y: inset, w: size - inset * 2, h: size - inset * 2 }
  const cx = px < r.x + rad ? r.x + rad : px > r.x + r.w - rad ? r.x + r.w - rad : px
  const cy = py < r.y + rad ? r.y + rad : py > r.y + r.h - rad ? r.y + r.h - rad : py
  const dx = px - cx
  const dy = py - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  const inX = px >= r.x && px <= r.x + r.w
  const inY = py >= r.y && py <= r.y + r.h
  if (inX && inY && (px >= r.x + rad && px <= r.x + r.w - rad || py >= r.y + rad && py <= r.y + r.h - rad)) {
    return -Math.min(
      Math.min(px - r.x, r.x + r.w - px),
      Math.min(py - r.y, r.y + r.h - py)
    )
  }
  return dist - rad
}

// 点是否落在圆环带（用于 HUD 弧线）
function inArcBand(px, py, size, cx, cy, r, width, a0, a1) {
  const dx = px - cx
  const dy = py - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (Math.abs(dist - r) > width / 2) return false
  let ang = Math.atan2(dy, dx) * 180 / Math.PI
  if (ang < 0) ang += 360
  if (a0 > a1) return ang >= a0 || ang <= a1
  return ang >= a0 && ang <= a1
}

function lerpColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    255
  ]
}

function draw(size) {
  const png = new PNG({ width: size, height: size })
  const s = size / 24
  const tri = [
    [5.2 * s, 4.2 * s],
    [17.6 * s, 12 * s],
    [5.2 * s, 19.8 * s]
  ]
  const borderW = 3 / 512 * size
  const arcCenter = [0.66 * size, 0.66 * size]
  const arcR = 0.23 * size
  const arcW = 4 / 512 * size

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) << 2
      const px = x + 0.5
      const py = y + 0.5
      let c = [0, 0, 0, 0]
      if (inRoundRect(px, py, size)) {
        // 渐变背景
        c = lerpColor(BG_TOP, BG_BOTTOM, py / size)
        // 青色描边（科技感外框）
        const dEdge = -distToRoundRect(px, py, size)
        if (dEdge <= borderW) {
          c = CYAN
        }
        // 播放三角
        if (inTriangle(px, py, tri[0], tri[1], tri[2])) {
          c = CYAN
        }
        // HUD 弧线（右下 45° 断点）
        if (inArcBand(px, py, size, arcCenter[0], arcCenter[1], arcR, arcW, 300, 40)) {
          c = CYAN_DIM
        }
        // 右下角小圆点
        const dot = [0.82 * size, 0.82 * size]
        const dDot = Math.sqrt((px - dot[0]) ** 2 + (py - dot[1]) ** 2)
        if (dDot <= 5 / 512 * size) {
          c = CYAN
        }
      }
      png.data[i] = c[0]
      png.data[i + 1] = c[1]
      png.data[i + 2] = c[2]
      png.data[i + 3] = c[3]
    }
  }
  return PNG.sync.write(png)
}

// ICO 容器（Vista+ 支持内嵌 PNG）
function icoWrap(pngBuf) {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  header[6] = 0
  header[7] = 0
  header[8] = 0
  header[9] = 0
  header.writeUInt16LE(1, 10)
  header.writeUInt16LE(32, 12)
  header.writeUInt32LE(pngBuf.length, 14)
  header.writeUInt32LE(22, 18)
  return Buffer.concat([header, pngBuf])
}

if (!fs.existsSync(BUILD)) fs.mkdirSync(BUILD, { recursive: true })
const p512 = draw(512)
const p256 = draw(256)
fs.writeFileSync(path.join(BUILD, 'icon-512.png'), p512)
fs.writeFileSync(path.join(BUILD, 'icon-256.png'), p256)
fs.writeFileSync(path.join(BUILD, 'icon.ico'), icoWrap(p256))
console.log('ICON_GENERATED')
fs.readdirSync(BUILD).forEach((f) => {
  const st = fs.statSync(path.join(BUILD, f))
  console.log(f, st.size)
})
