import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { IPC, type DownloadTask, type MediaItem, type StoreSnapshot } from '../shared/types'
import { WindowManager } from './windowManager'
import { DialogService } from './dialogService'
import { createElectronStoreBackend, StoreService } from './storeService'
import { scanMediaFolder, mediaItemsFromPaths } from './mediaService'
import { DownloadService } from './downloadService'

/** 模块级引用：供退出前（before-quit）清理下载子进程 */
export const downloadServiceRef: { current: DownloadService | null } = { current: null }

export function registerIpc(win: BrowserWindow): void {
  // 期望窗口尺寸：仅由缩放手柄/形态状态机更新。
  // frameless 窗口 setBounds/setPosition 存在每次 +1px 尺寸漂移（Electron/Windows bug），
  // moveTo 必须携带固定的期望尺寸（而非 getSize() 的漂移值）以打破放大循环。
  let expectedSize: [number, number] = [960, 540]

  const windowManager = new WindowManager({
    setFullScreen: (flag) => win.setFullScreen(flag),
    setAlwaysOnTop: (flag) => win.setAlwaysOnTop(flag),
    setBounds: (bounds) => {
      expectedSize = [bounds.width, bounds.height]
      win.setBounds(bounds)
    },
    getBounds: () => win.getBounds()
  })
  const dialog = new DialogService(win)
  const store = new StoreService(createElectronStoreBackend())

  const downloadService = new DownloadService({
    notify: (tasks: DownloadTask[]) => {
      if (!win.isDestroyed()) win.webContents.send(IPC.downloadUpdate, tasks)
    }
  })
  downloadServiceRef.current = downloadService

  // 主进程统一出口：下载目录可配置（settings.downloadDir），未配置用系统下载目录
  const downloadDir = (): string => store.getSettings().downloadDir || app.getPath('downloads')

  ipcMain.handle(IPC.downloadStart, (_event, item: MediaItem, duration?: number) => downloadService.start(item, downloadDir(), duration))
  ipcMain.handle(IPC.downloadGet, () => downloadService.getTasks())
  ipcMain.handle(IPC.downloadCancel, (_event, taskId: string) => downloadService.cancel(taskId))
  ipcMain.handle(IPC.downloadDismiss, (_event, taskId: string) => downloadService.dismiss(taskId))
  ipcMain.handle(IPC.downloadShowInFolder, (_event, taskId: string) => {
    const task = downloadService.findTask(taskId)
    if (task) shell.showItemInFolder(task.outPath)
  })

  ipcMain.handle(IPC.windowEnterFullscreen, () => windowManager.enterFullscreen())
  ipcMain.handle(IPC.windowExitFullscreen, () => windowManager.exitFullscreen())
  ipcMain.handle(IPC.windowToggleFullscreen, () => windowManager.toggleFullscreen())
  ipcMain.handle(IPC.windowEnterMini, () => windowManager.enterMini())
  ipcMain.handle(IPC.windowExitMini, () => windowManager.exitMini())
  ipcMain.handle(IPC.windowSetPinned, (_event, flag: boolean) => windowManager.setPinned(flag))
  ipcMain.handle(IPC.windowGetState, () => windowManager.getState())
  ipcMain.handle(IPC.windowMoveTo, (_event, x: number, y: number) => {
    win.setBounds({ x: Math.round(x), y: Math.round(y), width: expectedSize[0], height: expectedSize[1] })
  })
  ipcMain.handle(IPC.windowResizeTo, (_event, x: number, y: number, width: number, height: number) => {
    const area = screen.getDisplayMatching(win.getBounds()).workArea
    // 无最小尺寸限制（小窗口由渲染进程紧凑模式接管 UI），仅钳制工作区上限
    expectedSize = [
      Math.min(Math.max(1, Math.round(width)), Math.round(area.width * 1.5)),
      Math.min(Math.max(1, Math.round(height)), Math.round(area.height * 1.5))
    ]
    win.setBounds({ x: Math.round(x), y: Math.round(y), width: expectedSize[0], height: expectedSize[1] })
  })
  ipcMain.handle(IPC.windowMinimize, () => win.minimize())
  ipcMain.handle(IPC.windowClose, () => win.close())

  ipcMain.handle(IPC.dialogOpenFolder, () => dialog.openFolder())
  ipcMain.handle(IPC.dialogOpenFile, () => dialog.openFile())
  ipcMain.handle(IPC.dialogSave, (_event, defaultName: string) => dialog.save(defaultName))

  ipcMain.handle(IPC.storeGetAll, () => store.getAll())
  ipcMain.handle(IPC.storeSaveAll, (_event, snapshot: StoreSnapshot) => {
    store.saveAll(snapshot)
  })
  ipcMain.handle(IPC.mediaScanFolder, (_event, folder: string) => scanMediaFolder(folder))
  ipcMain.handle(IPC.mediaFromPaths, (_event, paths: string[]) => mediaItemsFromPaths(paths))
  ipcMain.handle(IPC.appReadyToClose, () => {
    if (!win.isDestroyed()) win.destroy()
  })
}
