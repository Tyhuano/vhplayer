import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../shared/types'
import { WindowManager } from './windowManager'
import { DialogService } from './dialogService'

export function registerIpc(win: BrowserWindow): void {
  const windowManager = new WindowManager({
    setFullScreen: (flag) => win.setFullScreen(flag),
    setAlwaysOnTop: (flag) => win.setAlwaysOnTop(flag),
    setBounds: (bounds) => win.setBounds(bounds),
    getBounds: () => win.getBounds()
  })
  const dialog = new DialogService(win)

  ipcMain.handle(IPC.windowEnterFullscreen, () => windowManager.enterFullscreen())
  ipcMain.handle(IPC.windowExitFullscreen, () => windowManager.exitFullscreen())
  ipcMain.handle(IPC.windowToggleFullscreen, () => windowManager.toggleFullscreen())
  ipcMain.handle(IPC.windowEnterMini, () => windowManager.enterMini())
  ipcMain.handle(IPC.windowExitMini, () => windowManager.exitMini())
  ipcMain.handle(IPC.windowGetState, () => windowManager.getState())

  ipcMain.handle(IPC.dialogOpenFolder, () => dialog.openFolder())
  ipcMain.handle(IPC.dialogOpenFile, () => dialog.openFile())
  ipcMain.handle(IPC.dialogSave, (_event, defaultName: string) => dialog.save(defaultName))
}
