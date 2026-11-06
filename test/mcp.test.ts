import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'
import { join } from 'node:path'

const pending = new Map<number, (message: Record<string, unknown>) => void>()
let child: ChildProcess
let reader: Interface
let nextId = 1
let stderr = ''

function request(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const id = nextId++
  child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  return new Promise((resolve, reject) => {
    pending.set(id, resolve)
    setTimeout(() => reject(new Error(`timeout: ${method}`)), 20_000)
  })
}

function result(message: Record<string, unknown>): Record<string, unknown> {
  return message.result as Record<string, unknown>
}

beforeAll(async () => {
  child = spawn(join(process.cwd(), 'node_modules/.bin/tsx'), ['src/mcp/cli.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, AIT_PANEL: '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stderr!.on('data', (chunk) => { stderr += chunk })
  reader = createInterface({ input: child.stdout! })
  reader.on('line', (line) => {
    const message = JSON.parse(line) as Record<string, unknown>
    if (typeof message.id === 'number' && pending.has(message.id)) {
      const resolve = pending.get(message.id)!
      pending.delete(message.id)
      resolve(message)
    }
  })
  const initialized = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'vitest', version: '0' },
  })
  expect(result(initialized)['serverInfo']).toMatchObject({ name: 'agent-interactive-terminal' })
})

afterAll(() => {
  child.stdin?.end()
  child.kill()
})

describe('MCP server', () => {
  it('lists the eight agent tools and the panel entry tool', async () => {
    const listed = await request('tools/list')
    const tools = result(listed)['tools'] as Array<{ name: string }>
    const names = tools.map((tool) => tool.name)
    expect(names.slice(0, 8)).toEqual([
      'terminal_open',
      'terminal_send',
      'terminal_wait',
      'terminal_snapshot',
      'terminal_key',
      'terminal_resize',
      'terminal_close',
      'terminal_list',
    ])
    expect(names).toContain('interactive_terminal')
    expect(names).toContain('terminal_ui_attach')
  })

  it('opens, drives, reads, and closes a session', async () => {
    const opened = await request('tools/call', {
      name: 'terminal_open',
      arguments: { cols: 90, rows: 24 },
    })
    const openedText = (result(opened)['content'] as Array<{ text: string }>)[0]!.text
    expect(openedText).toContain('[session: 1]')

    const sent = await request('tools/call', {
      name: 'terminal_send',
      arguments: { sessionId: '1', text: 'printf "mcp-vitest\\n"', timeoutMs: 15_000 },
    })
    const sentText = (result(sent)['content'] as Array<{ text: string }>)[0]!.text
    expect(sentText).toContain('mcp-vitest')
    expect(result(sent)['isError']).not.toBe(true)

    const snapshot = await request('tools/call', {
      name: 'terminal_snapshot',
      arguments: { sessionId: '1', view: 'screen' },
    })
    const snapshotText = (result(snapshot)['content'] as Array<{ text: string }>)[0]!.text
    expect(snapshotText).toContain('mcp-vitest')

    const closed = await request('tools/call', {
      name: 'terminal_close',
      arguments: { sessionId: '1' },
    })
    const closedText = (result(closed)['content'] as Array<{ text: string }>)[0]!.text
    expect(closedText).toContain('[closed: 1]')
  }, 30_000)
})
