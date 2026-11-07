import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(scriptDir, '..')

const manifest = JSON.parse(await readFile(join(pluginRoot, 'kimi.plugin.json'), 'utf8'))
const skill = await readFile(join(pluginRoot, 'skills/agent-interactive-terminal/SKILL.md'), 'utf8')
const terminalTools = [
  'terminal_open',
  'terminal_send',
  'terminal_wait',
  'terminal_snapshot',
  'terminal_key',
  'terminal_resize',
  'terminal_close',
  'terminal_list',
]
const appOnlyTools = [
  'interactive_terminal',
  'terminal_ui_list',
  'terminal_ui_attach',
  'terminal_ui_stream',
  'terminal_ui_open',
  'terminal_ui_write',
  'terminal_ui_resize',
  'terminal_ui_action',
]

assert.equal(manifest.name, 'agent-interactive-terminal')
assert.equal(manifest.sessionStart?.skill, 'agent-interactive-terminal')
assert.equal(manifest.mcpServers?.ait?.command, 'node')
assert.deepEqual(manifest.mcpServers?.ait?.args, ['./dist/mcp/cli.js'])
assert.equal(manifest.mcpServers?.ait?.cwd, './')
assert.deepEqual(manifest.mcpServers?.ait?.disabledTools, appOnlyTools)
assert.ok(existsSync(join(pluginRoot, 'skills/agent-interactive-terminal/SKILL.md')))
assert.match(skill, /^name: agent-interactive-terminal$/m)
assert.match(skill, /^description: .+/m)
for (const tool of terminalTools) {
  assert.ok(skill.includes(`mcp__ait__${tool}`), `skill is missing ${tool}`)
}
assert.ok(skill.includes('built-in `Bash`'))

for (const relative of ['dist/mcp/cli.js', 'dist/mcp/server.js', 'dist/panel/server.js', 'dist/panel/panel.html', 'dist/panel/app.bundle.js', 'node_modules/node-pty/package.json', 'node_modules/@xterm/xterm/package.json']) {
  assert.ok(existsSync(join(pluginRoot, relative)), `built plugin is missing ${relative}`)
}

const runtimeManifest = JSON.parse(await readFile(join(pluginRoot, 'runtime-manifest.json'), 'utf8'))
assert.equal(runtimeManifest.sourcePackage.version, '0.6.9')
for (const [name, version] of Object.entries(JSON.parse(await readFile(join(pluginRoot, 'package.json'), 'utf8')).dependencies)) {
  assert.equal(runtimeManifest.packages[name], version, `${name} is not pinned to the expected version`)
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

function startMcpServer() {
  const child = spawn(process.execPath, ['dist/mcp/cli.js'], {
    cwd: pluginRoot,
    env: { ...process.env, AIT_PANEL_TOKEN: 'kimi-verify-token' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const pending = new Map()
  const reader = createInterface({ input: child.stdout })
  let nextId = 1
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })

  reader.on('line', (line) => {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (typeof message.id === 'number' && pending.has(message.id)) {
      const finish = pending.get(message.id)
      pending.delete(message.id)
      finish(message)
    }
  })

  const request = (method, params = {}) => new Promise((resolveRequest, rejectRequest) => {
    const id = nextId++
    const timer = setTimeout(() => {
      pending.delete(id)
      rejectRequest(new Error(`timeout waiting for ${method}; stderr: ${stderr}`))
    }, 30_000)
    pending.set(id, (message) => {
      clearTimeout(timer)
      resolveRequest(message)
    })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })

  const stop = async () => {
    if (child.exitCode !== null) return
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'exit' })}\n`)
    child.stdin.end()
    const exited = await Promise.race([
      new Promise((resolveExit) => child.once('exit', () => resolveExit(true))),
      delay(5_000).then(() => false),
    ])
    if (!exited) child.kill('SIGTERM')
  }

  return { child, request, stderr: () => stderr, stop }
}

function textOf(message) {
  assert.equal(message.error, undefined, JSON.stringify(message.error))
  const content = message.result?.content
  assert.ok(Array.isArray(content), JSON.stringify(message))
  assert.equal(content[0]?.type, 'text')
  return content[0].text
}

async function connectPanel(panelUrl, sessionId) {
  const pageUrl = new URL(panelUrl)
  const token = pageUrl.searchParams.get('token')
  assert.ok(token, 'panel URL must include a token')
  const url = new URL('/attach', pageUrl)
  url.protocol = 'ws'
  url.searchParams.set('token', token)
  url.searchParams.set('sessionId', sessionId)
  url.searchParams.set('id', sessionId)
  const socket = new WebSocket(url)
  const messages = []
  const waiters = []

  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    messages.push(message)
    for (let index = waiters.length - 1; index >= 0; index--) {
      if (waiters[index].predicate(message)) {
        waiters[index].resolve(message)
        waiters.splice(index, 1)
      }
    }
  })

  await new Promise((resolveOpen, rejectOpen) => {
    const timer = setTimeout(() => rejectOpen(new Error('panel WebSocket open timeout')), 10_000)
    socket.addEventListener('open', () => {
      clearTimeout(timer)
      resolveOpen()
    }, { once: true })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      rejectOpen(new Error('panel WebSocket failed'))
    }, { once: true })
  })

  const next = (predicate, label) => {
    const existing = messages.find(predicate)
    if (existing !== undefined) return Promise.resolve(existing)
    return new Promise((resolveMessage, rejectMessage) => {
      const timer = setTimeout(() => rejectMessage(new Error(`timeout waiting for ${label}`)), 10_000)
      waiters.push({
        predicate,
        resolve: (message) => {
          clearTimeout(timer)
          resolveMessage(message)
        },
      })
    })
  }

  await next((message) => message.type === 'hello' && message.id === sessionId, 'panel hello')
  return { socket, next }
}

const server = startMcpServer()
try {
  const initialized = await server.request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'kimi-plugin-verify', version: '0' },
  })
  assert.equal(initialized.result.serverInfo.name, 'agent-interactive-terminal')

  const listed = await server.request('tools/list')
  const names = listed.result.tools.map((tool) => tool.name)
  for (const tool of terminalTools) assert.ok(names.includes(tool), `MCP server is missing ${tool}`)

  const marker = `kimi-smoke-${process.pid}`
  const openedText = textOf(await server.request('tools/call', {
    name: 'terminal_open',
    arguments: { cols: 90, rows: 24 },
  }))
  const sessionId = /\[session: ([^\]]+)\]/.exec(openedText)?.[1]
  const panelUrl = /\[panel: (http[^\]]+)\]/.exec(openedText)?.[1]
  assert.ok(sessionId, openedText)
  assert.ok(panelUrl, openedText)

  const sentText = textOf(await server.request('tools/call', {
    name: 'terminal_send',
    arguments: { sessionId, text: `printf '${marker}\\n'`, match: [marker], timeoutMs: 15_000 },
  }))
  assert.ok(sentText.includes(marker), sentText)

  const snapshotText = textOf(await server.request('tools/call', {
    name: 'terminal_snapshot',
    arguments: { sessionId, view: 'screen' },
  }))
  assert.ok(snapshotText.includes(marker), snapshotText)

  const waitedText = textOf(await server.request('tools/call', {
    name: 'terminal_wait',
    arguments: { sessionId, match: [`${marker}-never`], timeoutMs: 500 },
  }))
  assert.match(waitedText, /\[wait: (settled|timeout)\]/)

  textOf(await server.request('tools/call', {
    name: 'terminal_key',
    arguments: { sessionId, key: 'ctrl-c' },
  }))
  textOf(await server.request('tools/call', {
    name: 'terminal_resize',
    arguments: { sessionId, cols: 100, rows: 30 },
  }))

  const unauthorizedPage = await fetch(new URL(panelUrl).origin)
  assert.equal(unauthorizedPage.status, 401)
  const page = await fetch(panelUrl)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Terminal/)
  const state = await fetch(`${new URL(panelUrl).origin}/api/state?token=kimi-verify-token`)
  assert.equal(state.status, 200)
  assert.ok((await state.json()).sessions.some((session) => session.id === sessionId))

  const panel = await connectPanel(panelUrl, sessionId)
  panel.socket.send(JSON.stringify({ type: 'write', data: 'x' }))
  const denied = await panel.next((message) => message.type === 'denied', 'lease denial')
  assert.match(denied.reason, /take over/)
  panel.socket.send(JSON.stringify({ type: 'takeover' }))
  await panel.next((message) => message.type === 'status' && message.lease?.holder === 'human', 'human takeover')
  panel.socket.send(JSON.stringify({ type: 'handback' }))
  await panel.next((message) => message.type === 'status' && message.lease?.holder === 'agent', 'agent handback')
  panel.socket.close()

  const closedText = textOf(await server.request('tools/call', {
    name: 'terminal_close',
    arguments: { sessionId },
  }))
  assert.ok(closedText.includes(`[closed: ${sessionId}]`), closedText)

  console.log('Kimi plugin verification passed.')
} finally {
  await server.stop()
}
