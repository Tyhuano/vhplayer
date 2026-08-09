import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveCacheDir, resolveDataDir, type AppEnv } from '../appPaths'

function makeEnv(over: Partial<AppEnv> = {}): AppEnv {
  const exeDir = mkdtempSync(join(tmpdir(), 'vh-path-'))
  return {
    isPackaged: true,
    execPath: join(exeDir, 'VHplayer.exe'),
    userDataPath: join('C:\\Users\\test\\AppData\\Roaming\\VHplayer'),
    ...over
  }
}

describe('resolveDataDir（数据目录：安装目录优先，非必要不用 C 盘用户目录）', () => {
  it('打包版且安装目录可写 → exe 旁 data/ 目录', () => {
    const env = makeEnv()
    const dir = resolveDataDir(env)
    expect(dir).toBe(join(env.execPath.replace(/[\\/][^\\/]+$/, ''), 'data'))
    const probe = join(dir, '.probe')
    // 目录确实创建且可写
    const { writeFileSync, unlinkSync } = require('node:fs')
    writeFileSync(probe, 'x')
    unlinkSync(probe)
  })

  it('打包版但安装目录不可写（Program Files 场景）→ 回退 userData', () => {
    const env = makeEnv()
    const fs = require('node:fs') as typeof import('node:fs')
    const spy = jest.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
    })
    expect(resolveDataDir(env)).toBe(env.userDataPath)
    spy.mockRestore()
  })

  it('开发模式（未打包）→ 直接 userData', () => {
    const env = makeEnv({ isPackaged: false })
    expect(resolveDataDir(env)).toBe(env.userDataPath)
  })
})

describe('resolveCacheDir（Chromium 会话缓存目录）', () => {
  it('打包版且可写 → exe 旁 cache/ 目录', () => {
    const env = makeEnv()
    const dir = resolveCacheDir(env)
    expect(dir).toBe(join(env.execPath.replace(/[\\/][^\\/]+$/, ''), 'cache'))
  })

  it('打包版但不可写 → null（保持默认会话路径）', () => {
    const env = makeEnv()
    const fs = require('node:fs') as typeof import('node:fs')
    const spy = jest.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('EPERM'), { code: 'EPERM' })
    })
    expect(resolveCacheDir(env)).toBeNull()
    spy.mockRestore()
  })

  it('开发模式 → null（会话缓存留在 Electron 默认 userData）', () => {
    const env = makeEnv({ isPackaged: false })
    expect(resolveCacheDir(env)).toBeNull()
  })
})
