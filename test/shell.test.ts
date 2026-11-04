import { existsSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { TerminalSession } from '../src/session/session.js'

const sessions: TerminalSession[] = []
const zsh = ['/usr/bin/zsh', '/bin/zsh', '/usr/local/bin/zsh'].find((path) => existsSync(path))

async function open(shell: string): Promise<TerminalSession> {
  const session = await TerminalSession.open({ id: `s-shell-${sessions.length}`, cols: 80, rows: 24, shell })
  sessions.push(session)
  return session
}

function markerKinds(session: TerminalSession): { stop: () => void; kinds: string[] } {
  const kinds: string[] = []
  const stop = session.onOutput((data) => {
    for (const match of data.matchAll(/\x1b\]9999;([A-Z])(?:;(\d+))?\x07/g)) {
      kinds.push(match[1] ?? '?')
    }
  })
  return { stop, kinds }
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()))
})

describe('shell integration', () => {
  it('installs prompt markers in bash without losing the user rc', async () => {
    const session = await open('/bin/bash')
    const markers = markerKinds(session)
    await session.write('echo "marker-check:$((6*7))"')
    const result = await session.wait({ timeoutMs: 8000 })
    expect(result.outcome).toBe('settled')
    expect(result.view.text).toContain('marker-check:42')
    expect(markers.kinds).toContain('A')
    expect(markers.kinds).toContain('B')
    expect(markers.kinds).toContain('D')
    markers.stop()
  })

  it.skipIf(zsh === undefined)('installs prompt markers in zsh and restores ZDOTDIR', async () => {
    const session = await open(zsh as string)
    const markers = markerKinds(session)
    await session.write('echo "zdotdir=$ZDOTDIR"')
    const result = await session.wait({ timeoutMs: 8000 })
    expect(result.outcome).toBe('settled')
    expect(result.view.text).toContain(`zdotdir=${process.env['HOME']}`)
    expect(markers.kinds).toContain('A')
    expect(markers.kinds).toContain('B')
    expect(markers.kinds).toContain('D')
    markers.stop()
  })

  it.skipIf(zsh === undefined)('reports idle promptly on a zsh prompt', async () => {
    const started = Date.now()
    const session = await open(zsh as string)
    expect(session.phase).toBe('idle')
    expect(Date.now() - started).toBeLessThan(5000)
    await session.write('true')
    const result = await session.wait({ timeoutMs: 5000 })
    expect(result.phase).toBe('idle')
  })
})
