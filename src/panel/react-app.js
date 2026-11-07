/**
 * Codex MCP App composition root.
 *
 * Host-specific transport and presentation configuration live in
 * `src/adapters/codex`; the React panel itself is the shared DSH component.
 */
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { TerminalPanel } from '../../client/terminal.src.js'
import { createMcpTransport } from '../adapters/codex/transport.js'
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

const { McpSocket, api } = createMcpTransport(call)

const panelProps = {
  sessionId: 'ait',
  api,
  labels,
  attachPath: '/mcp-attach',
  socketFactory: McpSocket,
  attachSessionFor: (_panelId, tabId) => tabId,
}

async function boot() {
  if (globalThis.__AIT_TEST__ !== true) await app.connect()
  createRoot(rootElement).render(React.createElement(TerminalPanel, panelProps))
}

void boot().catch((error) => {
  rootElement.textContent = `terminal panel failed: ${error instanceof Error ? error.message : String(error)}`
})
