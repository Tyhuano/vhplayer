import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type IpcApi } from '../shared/types'

const api: IpcApi = {
  window: {
    enterFullscreen: () => ipcRenderer.invoke(IPC.windowEnterFullscreen),
    exitFullscreen: () => ipcRenderer.invoke(IPC.windowExitFullscreen),
    toggleFullscreen: () => ipcRenderer.invoke(IPC.windowToggleFullscreen),
    enterMini: () => ipcRenderer.invoke(IPC.windowEnterMini),
    exitMini: () => ipcRenderer.invoke(IPC.windowExitMini),
    getState: () => ipcRenderer.invoke(IPC.windowGetState)
  },
  dialog: {
    openFolder: () => ipcRenderer.invoke(IPC.dialogOpenFolder),
    openFile: () => ipcRenderer.invoke(IPC.dialogOpenFile),
    save: (defaultName) => ipcRenderer.invoke(IPC.dialogSave, defaultName)
  }
}

contextBridge.exposeInMainWorld('api', api)
