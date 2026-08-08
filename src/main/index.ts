import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { IPC } from '../shared/types'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 960,
    height: 540,
    minWidth: 480,
    minHeight: 320,
    frame: false,
    resizable: true,
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
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
