import { BrowserWindow, ipcMain } from 'electron'
import { IPC, type StoreSnapshot } from '../shared/types'
import { WindowManager } from './windowManager'
import { DialogService } from './dialogService'
import { createElectronStoreBackend, StoreService } from './storeService'
import { scanMediaFolder, mediaItemsFromPaths } from './mediaService'

export function registerIpc(win: BrowserWindow): void {
  const windowManager = new WindowManager({
    setFullScreen: (flag) => win.setFullScreen(flag),
    setAlwaysOnTop: (flag) => win.setAlwaysOnTop(flag),
    setBounds: (bounds) => win.setBounds(bounds),
    getBounds: () => win.getBounds()
  })
  const dialog = new DialogService(win)
  const store = new StoreService(createElectronStoreBackend())

  ipcMain.handle(IPC.windowEnterFullscreen, () => windowManager.enterFullscreen())
  ipcMain.handle(IPC.windowExitFullscreen, () => windowManager.exitFullscreen())
  ipcMain.handle(IPC.windowToggleFullscreen, () => windowManager.toggleFullscreen())
  ipcMain.handle(IPC.windowEnterMini, () => windowManager.enterMini())
  ipcMain.handle(IPC.windowExitMini, () => windowManager.exitMini())
  ipcMain.handle(IPC.windowGetState, () => windowManager.getState())
  ipcMain.handle(IPC.windowMoveTo, (_event, x: number, y: number) => {
    win.setPosition(Math.round(x), Math.round(y))
  })
  ipcMain.handle(IPC.windowResizeTo, (_event, x: number, y: number, width: number, height: number) => {
    win.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(480, Math.round(width)),
      height: Math.max(320, Math.round(height))
    })
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
