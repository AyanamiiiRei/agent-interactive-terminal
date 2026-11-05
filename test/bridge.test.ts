import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createBridgeHandler, isLocalRequest } from '../src/bridge.js'
import { TerminalRegistry } from '../src/session/registry.js'

interface Mounted {
  base: string
  registry: TerminalRegistry
  close(): Promise<void>
}

/**
 * Serve the bridge on a random loopback port with one fake DSH session.
 *
 * @param sessionId - id the bridge resolves; every other id is unknown.
 * @returns the base URL, the real registry and a disposer.
 */
async function serve(sessionId: string): Promise<Mounted> {
  const registry = new TerminalRegistry({ maxSessions: 2 })
  const handler = createBridgeHandler({
    resolve: (id) =>
      id === sessionId
        ? {
            registry,
            open: (options) => registry.open({ ...options, shell: '/bin/bash' }),
          }
        : undefined,
  })
  const server: Server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  return {
    base: `http://127.0.0.1:${port}/agent-terminal-bridge`,
    registry,
    async close() {
      await registry.closeAll()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

/**
 * Poll the bridge screen until the text appears or the budget runs out.
 *
 * @param base - bridge base URL.
 * @param sessionId - DSH session id.
 * @param id - terminal session id.
 * @param needle - text to look for.
 * @returns the last screen payload.
 */
async function waitForScreen(
  base: string,
  sessionId: string,
  id: string,
  needle: string,
): Promise<{ lines: string[] }> {
  const deadline = Date.now() + 5000
  let last: { lines: string[] } = { lines: [] }
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/screen?sessionId=${sessionId}&id=${id}`)
    last = (await response.json()) as { lines: string[] }
    if (last.lines.join('\n').includes(needle)) return last
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return last
}

describe('bridge request guard', () => {
  it('refuses a non-loopback peer', () => {
    const request = { socket: { remoteAddress: '10.0.0.8' }, headers: {} }
    expect(isLocalRequest(request as never)).toBe(false)
  })

  it('refuses a foreign Origin on a loopback peer', () => {
    const request = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: { host: '127.0.0.1:3080', origin: 'https://example.com' },
    }
    expect(isLocalRequest(request as never)).toBe(false)
  })

  it('accepts a same-origin loopback page', () => {
    const request = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' },
    }
    expect(isLocalRequest(request as never)).toBe(true)
  })
})

describe('bridge routes', () => {
  const mounted: Mounted[] = []
  afterEach(async () => {
    await Promise.all(mounted.splice(0).map((item) => item.close()))
  })

  it('lists the sessions the agent opened', async () => {
    const target = await serve('sess-1')
    mounted.push(target)
    const session = await target.registry.open({ shell: '/bin/bash', name: 'shared' })
    const response = await fetch(`${target.base}/state?sessionId=sess-1`)
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { sessions: { id: string; name: string }[] }
    expect(payload.sessions.map((item) => item.id)).toEqual([session.id])
    expect(payload.sessions[0]?.name).toBe('shared')
  })

  it('writes into the same screen the agent reads', async () => {
    const target = await serve('sess-1')
    mounted.push(target)
    const session = await target.registry.open({ shell: '/bin/bash' })
    const sent = await fetch(`${target.base}/send?sessionId=sess-1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: session.id, text: 'echo bridge-ok' }),
    })
    expect(sent.status).toBe(200)
    const screen = await waitForScreen(target.base, 'sess-1', session.id, 'bridge-ok')
    expect(screen.lines.join('\n')).toContain('bridge-ok')
  })

  it('opens a session from the page and closes it again', async () => {
    const target = await serve('sess-1')
    mounted.push(target)
    const opened = await fetch(`${target.base}/open?sessionId=sess-1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cols: 100, rows: 30 }),
    })
    expect(opened.status).toBe(201)
    const created = (await opened.json()) as { id: string }
    const closed = await fetch(`${target.base}/close?sessionId=sess-1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: created.id }),
    })
    expect(closed.status).toBe(200)
    expect(await closed.json()).toEqual({ closed: true })
  })

  it('rejects an unknown DSH session', async () => {
    const target = await serve('sess-1')
    mounted.push(target)
    const response = await fetch(`${target.base}/state?sessionId=missing`)
    expect(response.status).toBe(404)
  })
})
