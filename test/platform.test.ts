import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { inspectForeground } from '../src/pty/proc.js'
import {
  buildShellLaunch,
  cmdLaunch,
  powershellLaunch,
  resolveShell,
  wslLaunch,
} from '../src/session/shell.js'

describe('platform shell launches', () => {
  it('follows $SHELL on macOS and falls back to /bin/zsh', () => {
    expect(resolveShell(undefined, 'darwin', { SHELL: '/bin/zsh' })).toBe('/bin/zsh')
    expect(resolveShell('auto', 'darwin', { SHELL: '/bin/zsh' })).toBe('/bin/zsh')
    expect(resolveShell(undefined, 'darwin', {})).toBe('/bin/zsh')
    expect(resolveShell(undefined, 'linux', {})).toBe('/bin/bash')
  })

  it('treats a Windows shell as a choice rather than a POSIX path', () => {
    expect(resolveShell(undefined, 'win32', {})).toBe('auto')
    expect(resolveShell('zsh', 'win32', {})).toBe('zsh')
    expect(resolveShell('powershell.exe', 'win32', {})).toBe('powershell.exe')
  })

  it('builds the plain WSL command', () => {
    expect(wslLaunch('bash', 'wsl.exe')).toMatchObject({
      file: 'wsl.exe',
      args: ['--exec', 'bash', '-i'],
      label: 'bash (WSL)',
    })
    expect(wslLaunch('zsh', 'wsl.exe').args).toEqual(['--exec', 'zsh', '-i'])
  })

  it('passes the translated rc directory into WSL', () => {
    const launch = wslLaunch('zsh', 'wsl.exe', { dir: '/mnt/c/temp/ait', userHome: '/home/sabu' })
    expect(launch.args).toEqual([
      '--exec',
      'env',
      'ZDOTDIR=/mnt/c/temp/ait',
      'AIT_WRAP_DIR=/mnt/c/temp/ait',
      'AIT_USER_ZDOTDIR=/home/sabu',
      'zsh',
      '-i',
    ])
  })

  it('builds PowerShell and cmd fallbacks', () => {
    expect(powershellLaunch('C:/Program Files/PowerShell/7/pwsh.exe', 'PowerShell 7')).toMatchObject({
      file: 'C:/Program Files/PowerShell/7/pwsh.exe',
      args: ['-NoLogo'],
      label: 'PowerShell 7',
    })
    expect(cmdLaunch('C:/Windows/System32/cmd.exe')).toMatchObject({
      file: 'C:/Windows/System32/cmd.exe',
      args: [],
    })
  })

  it('falls back to a native Windows shell without WSL and explains explicit failures', () => {
    const fallback = buildShellLaunch(undefined, { platform: 'win32', env: { PATH: '', SystemRoot: 'C:\\Nope', windir: 'C:\\Nope' } })
    expect(fallback.file.toLowerCase().endsWith('cmd.exe')).toBe(true)
    expect(() => buildShellLaunch('zsh', { platform: 'win32', env: { PATH: '', SystemRoot: 'C:\\Nope', windir: 'C:\\Nope' } })).toThrow(/WSL/)
  })

  it('does not inspect /proc on macOS or Windows', () => {
    expect(inspectForeground(1, 'darwin')).toBeUndefined()
    expect(inspectForeground(1, 'win32')).toBeUndefined()
  })

  const zsh = ['/usr/bin/zsh', '/bin/zsh', '/usr/local/bin/zsh'].find((path) => existsSync(path))
  it.skipIf(zsh === undefined)('generates a zsh rc for macOS as well', () => {
    const launch = buildShellLaunch(zsh as string, { platform: 'darwin', env: { SHELL: zsh } })
    try {
      expect(launch.label).toBe('zsh')
      expect(launch.args).toContain('-i')
      expect(launch.env?.['ZDOTDIR']).toBeTypeOf('string')
    } finally {
      launch.cleanup()
    }
  })
})
