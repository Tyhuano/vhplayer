import { BrowserWindow, dialog } from 'electron'

export class DialogService {
  constructor(private readonly win: BrowserWindow) {}

  async openFolder(): Promise<string | null> {
    const result = await dialog.showOpenDialog(this.win, {
      properties: ['openDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  }

  async openFile(): Promise<string[] | null> {
    const result = await dialog.showOpenDialog(this.win, {
      properties: ['openFile'],
      filters: [
        { name: '媒体文件', extensions: ['mp4', 'webm', 'ogv', 'mov', 'm3u8', 'flv', 'mkv'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    return result.canceled ? null : result.filePaths
  }

  async save(defaultName: string): Promise<string | null> {
    const result = await dialog.showSaveDialog(this.win, {
      defaultPath: defaultName,
      filters: [{ name: 'VHplayer 播放列表', extensions: ['mhlb'] }]
    })
    return result.canceled ? null : (result.filePath ?? null)
  }
}
