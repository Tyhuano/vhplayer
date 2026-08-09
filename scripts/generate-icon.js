// 生成应用图标：品牌红圆角方块 + 白色播放三角（Feather play 图形，MIT）
// 输出 build/icon-512.png、build/icon-256.png、build/icon.ico（内嵌 256 PNG）
const { PNG } = require('pngjs')
const fs = require('fs')
const path = require('path')

const BUILD = path.join(__dirname, 'build')

const RED = [254, 44, 85, 255]
const WHITE = [255, 255, 255, 255]

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

function draw(size) {
  const png = new PNG({ width: size, height: size })
  // 三角顶点（Feather play polygon 5,3 19,12 5,21 缩放到 size）
  const s = size / 24
  const tri = [
    [5 * s, 3 * s],
    [19 * s, 12 * s],
    [5 * s, 21 * s]
  ]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) << 2
      let c = [0, 0, 0, 0]
      if (inRoundRect(x + 0.5, y + 0.5, size)) {
        c = inTriangle(x + 0.5, y + 0.5, tri[0], tri[1], tri[2]) ? WHITE : RED
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
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // count
  header[6] = 0 // width 256
  header[7] = 0 // height 256
  header[8] = 0 // colors
  header[9] = 0 // reserved
  header.writeUInt16LE(1, 10) // planes
  header.writeUInt16LE(32, 12) // bpp
  header.writeUInt32LE(pngBuf.length, 14) // size
  header.writeUInt32LE(22, 18) // offset
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
