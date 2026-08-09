import { app, BrowserWindow, protocol, shell } from 'electron'
import { createReadStream, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { extname, join } from 'node:path'
import { registerIpc, downloadServiceRef } from './ipc'
import { IPC } from '../shared/types'

const MEDIA_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  m3u8: 'application/vnd.apple.mpegurl',
  flv: 'video/x-flv'
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'vh', privileges: { standard: true, secure: true, stream: true } }
])

function handleVhProtocol(request: Request): Response {
  let filePath = decodeURIComponent(request.url.slice('vh://local'.length))
  filePath = filePath.replace(/^[/\\]+/, '')
  try {
    const stat = statSync(filePath)
    const mime = MEDIA_MIME[extname(filePath).slice(1).toLowerCase()] ?? 'application/octet-stream'
    const rangeHeader = request.headers.get('range')
    if (rangeHeader) {
      const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
      const start = match && match[1] ? parseInt(match[1], 10) : 0
      const end = match && match[2] ? parseInt(match[2], 10) : stat.size - 1
      return new Response(Readable.toWeb(createReadStream(filePath, { start, end })) as unknown as ReadableStream, {
        status: 206,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes'
        }
      })
    }
    return new Response(Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream, {
      status: 200,
      headers: { 'Content-Type': mime, 'Content-Length': String(stat.size), 'Accept-Ranges': 'bytes' }
    })
  } catch {
    return new Response('not found', { status: 404 })
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 960,
    height: 540,
    frame: false,
    resizable: false,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // 关闭前通知渲染进程持久化，1.5s 超时兜底
  win.on('close', (event) => {
    event.preventDefault()
    win.webContents.send(IPC.appClosing)
    setTimeout(() => {
      if (!win.isDestroyed()) win.destroy()
    }, 1500)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  registerIpc(win)

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  // vh:// 协议：渲染进程播放本地媒体的统一入口（dev/prod 一致，支持 Range 分片）
  protocol.handle('vh', (request) => handleVhProtocol(request))

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // 下载中退出：杀掉 ffmpeg 子进程并删除半成品（避免残留）
  downloadServiceRef.current?.shutdown()
})
