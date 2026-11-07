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

const DSW_DARK = {
  '--dsw-alias-bg-base': '#10161d',
  '--dsw-alias-bg-layer-1': '#1a222c',
  '--dsw-alias-bg-mask-1': 'rgba(0,0,0,0.50)',
  '--dsw-alias-border-l1': 'rgba(255,255,255,0.10)',
  '--dsw-alias-border-l2': 'rgba(255,255,255,0.16)',
  '--dsw-alias-label-primary': '#e8edf2',
  '--dsw-alias-label-secondary': 'rgba(232,237,242,0.56)',
  '--dsw-alias-label-tertiary': 'rgba(232,237,242,0.30)',
  '--dsw-alias-link': '#f2a65a',
  '--dsw-alias-interactive-bg-hover': 'rgba(255,255,255,0.07)',
  '--dsw-alias-settings-card-fill': 'rgba(255,255,255,0.035)',
  '--dsw-alias-settings-card-stroke': 'rgba(255,255,255,0.08)',
  '--dsw-alias-switch-thumb': '#fbfbfb',
}
const DSW_LIGHT = {
  '--dsw-alias-bg-base': '#ffffff',
  '--dsw-alias-bg-layer-1': '#f4f5f7',
  '--dsw-alias-bg-mask-1': 'rgba(15,17,21,0.24)',
  '--dsw-alias-border-l1': 'rgba(15,17,21,0.10)',
  '--dsw-alias-border-l2': 'rgba(15,17,21,0.16)',
  '--dsw-alias-label-primary': '#1f2328',
  '--dsw-alias-label-secondary': 'rgba(31,35,40,0.62)',
  '--dsw-alias-label-tertiary': 'rgba(31,35,40,0.38)',
  '--dsw-alias-link': '#b45309',
  '--dsw-alias-interactive-bg-hover': 'rgba(15,17,21,0.06)',
  '--dsw-alias-settings-card-fill': '#ffffff',
  '--dsw-alias-settings-card-stroke': 'rgba(15,17,21,0.10)',
  '--dsw-alias-switch-thumb': '#ffffff',
}

function applyHostTheme(theme) {
  const dark = theme === 'dark' || (theme !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true)
  document.body.toggleAttribute('data-ds-dark-theme', dark)
  document.documentElement.style.background = dark ? '#0f1115' : '#eef1f5'
  const tokens = dark ? DSW_DARK : DSW_LIGHT
  for (const [name, value] of Object.entries(tokens)) document.documentElement.style.setProperty(name, value)
}

try {
  const key = 'ait:terminal-settings'
  const existing = JSON.parse(localStorage.getItem(key) ?? '{}')
  if (!Number.isFinite(existing.version) || existing.version < 4) {
    localStorage.setItem(key, JSON.stringify({ ...existing, version: 4, theme: 'follow' }))
  }
} catch { /* the host may deny localStorage */ }
document.documentElement.style.background = '#0f1115'
const layoutStyle = document.createElement('style')
layoutStyle.textContent = 'html,body,#app{height:100%;margin:0}body{overflow:hidden}'
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
  if (globalThis.__AIT_TEST__ === true) {
    applyHostTheme('dark')
  } else {
    await app.connect()
    applyHostTheme(app.getHostContext?.()?.theme)
    app.onhostcontextchanged = (context) => applyHostTheme(context?.theme)
  }
  createRoot(rootElement).render(React.createElement(TerminalPanel, panelProps))
}

void boot().catch((error) => {
  rootElement.textContent = `terminal panel failed: ${error instanceof Error ? error.message : String(error)}`
})
