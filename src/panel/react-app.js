import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { TerminalPanel } from '../../client/terminal.src.js'
import { App } from './vendor/ext-apps.js'

const app = new App({ name: 'agent-interactive-terminal', version: '0.6.9' })
const rootElement = document.getElementById('app')
if (rootElement === null) throw new Error('missing #app')
rootElement.textContent = ''
document.body.setAttribute('data-ds-dark-theme', '')
document.documentElement.setAttribute('data-ds-dark-theme', '')
try {
  const key = 'ait:terminal-settings'
  const existing = JSON.parse(localStorage.getItem(key) ?? '{}')
  localStorage.setItem(key, JSON.stringify({ ...existing, version: 3, theme: 'dark' }))
} catch { /* the host may deny localStorage */ }
document.documentElement.style.background = '#0f1115'
const layoutStyle = document.createElement('style')
layoutStyle.textContent = 'html,body,#app{height:100%;margin:0;background:#0f1115}body{overflow:hidden}'
document.head.appendChild(layoutStyle)

const labels = {
  terminal: '终端',
  denied: 'Agent 当前不可操作',
  exited: '终端已退出',
  reconnecting: '正在重新连接…',
  disconnected: '连接已断开',
}

async function call(name, args = {}) {
  if (globalThis.__AIT_TEST__ === true) {
    const status = {
      id: '1',
      name: '终端 1',
      phase: 'idle',
      holder: 'agent',
      access: 'collaborate',
      suspended: false,
      cols: 100,
      rows: 30,
      pending: 0,
      pendingCommands: [],
      revision: 1,
    }
    if (name === 'terminal_ui_list') return { sessions: [status] }
    if (name === 'terminal_ui_attach') return { ansi: '', cursor: 0, status }
    if (name === 'terminal_ui_stream') {
      await new Promise((resolve) => setTimeout(resolve, 100))
      return { chunks: [], cursor: 0, status }
    }
    if (name === 'terminal_ui_open') return status
    if (name === 'terminal_ui_write' || name === 'terminal_ui_resize' || name === 'terminal_ui_action') return status
    return {}
  }
  const result = await app.callServerTool({ name, arguments: args })
  const block = result.content?.find((item) => item.type === 'text')
  if (result.isError === true) throw new Error(block?.text ?? 'tool call failed')
  return result.structuredContent ?? {}
}

function statusMessage(status) {
  return {
    type: 'status',
    ...status,
    lease: { holder: status.holder, suspended: status.suspended === true },
    pending: Array.isArray(status.pendingCommands) ? status.pendingCommands : [],
  }
}

class McpSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(url) {
    this.url = String(url)
    this.readyState = McpSocket.CONNECTING
    this.binaryType = 'arraybuffer'
    this.onopen = null
    this.onmessage = null
    this.onclose = null
    this.onerror = null
    this.cursor = 0
    this.disposed = false
    const parsed = new URL(this.url)
    this.sessionId = parsed.searchParams.get('sessionId') ?? ''
    queueMicrotask(() => { void this.connect() })
  }

  emit(message) {
    if (!this.disposed) this.onmessage?.({ data: JSON.stringify(message) })
  }

  emitOutput(text) {
    if (this.disposed || text === '') return
    const bytes = new TextEncoder().encode(text)
    this.onmessage?.({ data: bytes.buffer })
  }

  async connect() {
    try {
      const initial = await call('terminal_ui_attach', { sessionId: this.sessionId })
      if (this.disposed) return
      this.readyState = McpSocket.OPEN
      this.onopen?.()
      const status = initial.status ?? {}
      this.emit({ type: 'hello', name: status.name, cols: status.cols, rows: status.rows })
      if (typeof initial.ansi === 'string') this.emit({ type: 'snapshot', data: initial.ansi })
      this.cursor = typeof initial.cursor === 'number' ? initial.cursor : 0
      this.emit(statusMessage(status))
      void this.stream()
    } catch (error) {
      if (this.disposed) return
      const message = error instanceof Error ? error.message : String(error)
      let banner = document.getElementById('ait-socket-error')
      if (banner === null) {
        banner = document.createElement('pre')
        banner.id = 'ait-socket-error'
        banner.style.cssText =
          'position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;margin:0;padding:8px;border:1px solid #e06c75;border-radius:6px;background:#2b1418;color:#ffb4bd;font:11px/1.4 monospace;white-space:pre-wrap;max-height:40%;overflow:auto'
        document.body.appendChild(banner)
      }
      banner.textContent = `terminal socket: ${message}`
      this.readyState = McpSocket.CLOSED
      this.onclose?.({ reason: message })
    }
  }

  async stream() {
    while (!this.disposed && this.readyState === McpSocket.OPEN) {
      let value
      try {
        value = await call('terminal_ui_stream', {
          sessionId: this.sessionId,
          cursor: this.cursor,
          timeoutMs: 8000,
        })
      } catch {
        break
      }
      if (this.disposed) return
      for (const chunk of Array.isArray(value.chunks) ? value.chunks : []) {
        if (typeof chunk === 'string') this.emitOutput(chunk)
      }
      if (typeof value.cursor === 'number') this.cursor = value.cursor
      if (value.status) {
        this.emit(statusMessage(value.status))
        if (value.status.exited === true) {
          this.emit({ type: 'exited', exitCode: value.status.exitCode })
          this.readyState = McpSocket.CLOSED
          return
        }
      }
    }
    if (!this.disposed) {
      this.readyState = McpSocket.CLOSED
      this.onclose?.({})
    }
  }

  send(raw) {
    if (this.readyState !== McpSocket.OPEN) return
    let message
    try { message = JSON.parse(raw) } catch { return }
    const run = async () => {
      if (message.type === 'write') {
        const status = await call('terminal_ui_write', { sessionId: this.sessionId, data: message.data })
        this.emit(statusMessage(status))
      } else if (message.type === 'resize') {
        await call('terminal_ui_resize', { sessionId: this.sessionId, cols: message.cols, rows: message.rows })
      } else if (message.type === 'takeover' || message.type === 'handback' || message.type === 'observe' || message.type === 'collaborate') {
        const status = await call('terminal_ui_action', { sessionId: this.sessionId, action: message.type })
        this.emit(statusMessage(status))
      }
    }
    void run().catch(() => {})
  }

  close() {
    this.disposed = true
    this.readyState = McpSocket.CLOSED
  }
}

let autoOpened = false
const api = {
  async state() {
    let value = await call('terminal_ui_list')
    let sessions = Array.isArray(value.sessions) ? value.sessions : []
    if (sessions.length === 0 && !autoOpened) {
      autoOpened = true
      await call('terminal_ui_open', { cols: 120, rows: 30 })
      value = await call('terminal_ui_list')
      sessions = Array.isArray(value.sessions) ? value.sessions : []
    }
    return {
      sessions: sessions.map((session) => ({
        id: String(session.id),
        name: String(session.name ?? `终端 ${session.id}`),
        agentAt: typeof session.revision === 'number' ? session.revision : 0,
        holder: session.holder === 'human' ? 'human' : 'agent',
      })),
    }
  },
  async open(cols, rows) {
    const created = await call('terminal_ui_open', { cols, rows })
    return { id: String(created.id), name: created.name }
  },
  async close(id) {
    await call('terminal_ui_action', { sessionId: id, action: 'close' })
  },
}

async function boot() {
  if (globalThis.__AIT_TEST__ === true) {
    createRoot(rootElement).render(
      React.createElement(TerminalPanel, {
        sessionId: 'ait',
        api,
        labels,
        attachPath: '/mcp-attach',
        socketFactory: McpSocket,
        attachSessionFor: (_panelId, tabId) => tabId,
      }),
    )
    return
  }
  await app.connect()
  createRoot(rootElement).render(
    React.createElement(TerminalPanel, {
      sessionId: 'ait',
      api,
      labels,
      attachPath: '/mcp-attach',
    }),
  )
}

void boot().catch((error) => {
  rootElement.textContent = `terminal panel failed: ${error instanceof Error ? error.message : String(error)}`
})
