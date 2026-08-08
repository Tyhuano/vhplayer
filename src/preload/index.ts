import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type IpcApi, type StoreSnapshot } from '../shared/types'

const api: IpcApi = {
  window: {
    enterFullscreen: () => ipcRenderer.invoke(IPC.windowEnterFullscreen),
    exitFullscreen: () => ipcRenderer.invoke(IPC.windowExitFullscreen),
    toggleFullscreen: () => ipcRenderer.invoke(IPC.windowToggleFullscreen),
    enterMini: () => ipcRenderer.invoke(IPC.windowEnterMini),
    exitMini: () => ipcRenderer.invoke(IPC.windowExitMini),
    getState: () => ipcRenderer.invoke(IPC.windowGetState),
    moveTo: (x, y) => ipcRenderer.invoke(IPC.windowMoveTo, x, y),
    resizeTo: (x, y, width, height) => ipcRenderer.invoke(IPC.windowResizeTo, x, y, width, height),
    setPinned: (flag: boolean) => ipcRenderer.invoke(IPC.windowSetPinned, flag),
    minimize: () => ipcRenderer.invoke(IPC.windowMinimize),
    close: () => ipcRenderer.invoke(IPC.windowClose)
  },
  dialog: {
    openFolder: () => ipcRenderer.invoke(IPC.dialogOpenFolder),
    openFile: () => ipcRenderer.invoke(IPC.dialogOpenFile),
    save: (defaultName) => ipcRenderer.invoke(IPC.dialogSave, defaultName)
  },
  store: {
    getAll: () => ipcRenderer.invoke(IPC.storeGetAll),
    saveAll: (snapshot: StoreSnapshot) => ipcRenderer.invoke(IPC.storeSaveAll, snapshot)
  },
  media: {
    scanFolder: (folder: string) => ipcRenderer.invoke(IPC.mediaScanFolder, folder),
    fromPaths: (paths: string[]) => ipcRenderer.invoke(IPC.mediaFromPaths, paths)
  },
  app: {
    onClosing: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on(IPC.appClosing, listener)
      return () => {
        ipcRenderer.removeListener(IPC.appClosing, listener)
      }
    },
    readyToClose: () => ipcRenderer.invoke(IPC.appReadyToClose)
  }
}

contextBridge.exposeInMainWorld('api', api)
