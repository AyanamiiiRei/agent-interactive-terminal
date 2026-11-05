import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { createAttachUpgrade } from '../src/attach.js'
import { TerminalRegistry } from '../src/session/registry.js'

interface Mounted {
  url: string
  registry: TerminalRegistry
  close(): Promise<void>
}

/**
 * Serve one attach route on a random loopback port.
 *
 * @returns the WebSocket URL prefix and a disposer.
 */
async function serve(): Promise<Mounted> {
  const registry = new TerminalRegistry({ maxSessions: 2 })
  const attach = createAttachUpgrade({
    resolve: (id) => (id === 'session-1' ? { registry, open: (options) => registry.open(options) } : undefined),
  })
  const server: Server = createServer()
  server.on('upgrade', attach.handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  return {
    url: `ws://127.0.0.1:${port}/agent-terminal-bridge/attach`,
    registry,
    async close() {
      attach.dispose()
      await registry.closeAll()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

/**
 * Poll until a predicate holds.
 *
 * @param predicate - condition to test.
 * @param timeoutMs - budget in milliseconds.
 */
async function waitUntil(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  throw new Error('timed out waiting for the terminal stream')
}

describe('attach stream', () => {
  const mounted: Mounted[] = []
  const sockets: WebSocket[] = []

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.terminate()
    for (const item of mounted.splice(0)) await item.close()
  })

  it('paints the session, streams output, and enforces the lease', async () => {
    const host = await serve()
    mounted.push(host)
    const session = await host.registry.open({ shell: '/bin/bash', cwd: tmpdir(), cols: 80, rows: 24, name: 'ws' })

    const messages: Array<Record<string, unknown>> = []
    let output = ''
    const socket = new WebSocket(`${host.url}?sessionId=session-1&id=${session.id}`)
    sockets.push(socket)
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        output += data.toString()
        return
      }
      messages.push(JSON.parse(String(data)) as Record<string, unknown>)
    })

    await waitUntil(() => messages.some((message) => message['type'] === 'hello'))
    const hello = messages.find((message) => message['type'] === 'hello')
    expect(hello?.['id']).toBe(session.id)
    expect(hello?.['name']).toBe('ws')
    await waitUntil(() => messages.some((message) => message['type'] === 'snapshot'))

    socket.send(JSON.stringify({ type: 'write', data: 'echo denied\r' }))
    await waitUntil(() => messages.some((message) => message['type'] === 'denied'))
    expect(output).not.toContain('denied\r\n')

    socket.send(JSON.stringify({ type: 'takeover' }))
    await waitUntil(() => messages.some((message) => message['type'] === 'status' && (message['lease'] as { holder: string }).holder === 'human'))

    socket.send(JSON.stringify({ type: 'write', data: 'echo ws-probe\r' }))
    await waitUntil(() => output.includes('ws-probe'))

    socket.send(JSON.stringify({ type: 'resize', cols: 100, rows: 30 }))
    await waitUntil(() => session.size.cols === 100 && session.size.rows === 30)

    const beforeHandback = messages.length
    socket.send(JSON.stringify({ type: 'handback' }))
    await waitUntil(() =>
      messages
        .slice(beforeHandback)
        .some((message) => message['type'] === 'status' && (message['lease'] as { holder: string }).holder === 'agent'),
    )

    await host.registry.close(session.id)
    await waitUntil(() => messages.some((message) => message['type'] === 'exited'))
    const exited = messages.find((message) => message['type'] === 'exited')
    expect(exited?.['exitCode']).toBeGreaterThanOrEqual(0)
    expect(exited?.['closedByOwner']).toBe(true)
    expect(typeof exited?.['tail']).toBe('string')
  }, 30_000)

  it('returns the keyboard to the agent when the view disconnects', async () => {
    const host = await serve()
    mounted.push(host)
    const session = await host.registry.open({ shell: '/bin/bash', cwd: tmpdir(), cols: 80, rows: 24 })
    const socket = new WebSocket(`${host.url}?sessionId=session-1&id=${session.id}`)
    sockets.push(socket)
    const messages: Array<Record<string, unknown>> = []
    socket.on('message', (data, isBinary) => {
      if (!isBinary) messages.push(JSON.parse(String(data)) as Record<string, unknown>)
    })
    await waitUntil(() => messages.some((message) => message['type'] === 'hello'))
    socket.send(JSON.stringify({ type: 'takeover' }))
    await waitUntil(() => session.lease.holder === 'human')
    socket.close()
    await waitUntil(() => session.lease.holder === 'agent')
  }, 30_000)

  it('applies access levels sent from the panel', async () => {
    const host = await serve()
    mounted.push(host)
    const session = await host.registry.open({ shell: '/bin/bash', cwd: tmpdir(), cols: 80, rows: 24, name: 'ws-access' })
    const messages: Array<Record<string, unknown>> = []
    const socket = new WebSocket(`${host.url}?sessionId=session-1&id=${session.id}`)
    sockets.push(socket)
    socket.on('message', (data, isBinary) => {
      if (!isBinary) messages.push(JSON.parse(String(data)) as Record<string, unknown>)
    })
    const lastStatus = () => [...messages].reverse().find((message) => message['type'] === 'status')

    await waitUntil(() => lastStatus()?.['access'] === 'collaborate')

    socket.send(JSON.stringify({ type: 'access', value: 'observe' }))
    await waitUntil(() => session.agentAccess === 'observe' && lastStatus()?.['access'] === 'observe')
    await expect(session.write('echo nope')).rejects.toMatchObject({ code: 'READ_ONLY' })
    expect(session.snapshot().cols).toBe(80)

    socket.send(JSON.stringify({ type: 'access', value: 'sealed' }))
    await waitUntil(() => session.agentAccess === 'sealed' && lastStatus()?.['access'] === 'sealed')
    let sealError: unknown
    try {
      session.snapshot()
    } catch (error) {
      sealError = error
    }
    expect((sealError as { code?: string }).code).toBe('SEALED')

    // The person keeps full access, so their own typing still reaches the shell.
    await session.write('echo human-in-sealed', { origin: 'human' })
    await waitUntil(() => session.agentAccess === 'sealed')

    socket.send(JSON.stringify({ type: 'access', value: 'collaborate' }))
    await waitUntil(() => session.agentAccess === 'collaborate' && lastStatus()?.['access'] === 'collaborate')
  }, 30_000)

  it('refuses an unknown session before upgrading', async () => {
    const host = await serve()
    mounted.push(host)
    const socket = new WebSocket(`${host.url}?sessionId=session-1&id=s-missing`)
    sockets.push(socket)
    const status = await new Promise<number>((resolve) => {
      socket.on('unexpected-response', (_request, response) => {
        resolve(response.statusCode ?? 0)
      })
      socket.on('error', () => resolve(0))
    })
    expect(status).toBe(404)
  })
})
