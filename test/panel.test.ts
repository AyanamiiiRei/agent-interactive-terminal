import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { TerminalRegistry } from '../src/session/registry.js'
import { createPanelServer, type PanelServer } from '../src/panel/server.js'

let registry: TerminalRegistry
let panel: PanelServer

beforeAll(async () => {
  registry = new TerminalRegistry({ maxSessions: 2 })
  panel = await createPanelServer({ registry, port: 0, token: 'vitest-panel' })
})

afterAll(async () => {
  await panel.close()
  await registry.closeAll()
})

function base(): string {
  return `http://127.0.0.1:${panel.port}`
}

describe('standalone panel', () => {
  it('serves the page only with the token and lists sessions', async () => {
    const denied = await fetch(`${base()}/api/state`)
    expect(denied.status).toBe(401)

    const page = await fetch(`${base()}/?token=vitest-panel`)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Agent Interactive Terminal')

    const state = (await fetch(`${base()}/api/state?token=vitest-panel`).then((response) => response.json())) as {
      sessions: unknown[]
    }
    expect(state.sessions).toEqual([])
  })

  it('opens a session and streams a person’s keystrokes through attach', async () => {
    const created = (await fetch(`${base()}/api/open?token=vitest-panel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cols: 90, rows: 24 }),
    }).then((response) => response.json())) as { id: string }
    expect(created.id).toBe('1')

    const socket = new WebSocket(`ws://127.0.0.1:${panel.port}/attach?token=vitest-panel&sessionId=local&id=1`)
    const messages: Array<Record<string, unknown>> = []
    let output = ''
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        output += data.toString()
      } else {
        messages.push(JSON.parse(data.toString()) as Record<string, unknown>)
      }
    })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('attach timeout')), 10_000)
      socket.once('open', () => {
        clearTimeout(timer)
        resolve()
      })
      socket.once('error', reject)
    })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(messages.some((message) => message.type === 'hello')).toBe(true)
    expect(messages.some((message) => message.type === 'snapshot')).toBe(true)

    socket.send(JSON.stringify({ type: 'takeover' }))
    socket.send(JSON.stringify({ type: 'write', data: 'printf "panel-vitest\\n"\r' }))
    const deadline = Date.now() + 5_000
    while (!output.includes('panel-vitest') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(output).toContain('panel-vitest')
    socket.close()

    const closed = (await fetch(`${base()}/api/close?token=vitest-panel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '1' }),
    }).then((response) => response.json())) as { closed: boolean }
    expect(closed.closed).toBe(true)
  }, 20_000)
})
