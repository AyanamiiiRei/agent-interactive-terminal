/**
 * Conversation-panel app for ChatGPT and Codex.
 *
 * This runs inside the host's MCP App iframe. It renders an xterm screen and
 * speaks to the terminal session through app-only MCP tools: an initial ANSI
 * snapshot, long-polled raw output chunks, and person-origin writes. The chrome
 * uses the same panel stylesheet as the DSH sidebar terminal.
 *
 * @module agent-interactive-terminal/panel/app
 */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import xtermCss from '@xterm/xterm/css/xterm.css'
import panelCss from './panel.css'
import { App } from './vendor/ext-apps.js'

const app = new App({ name: 'agent-interactive-terminal', version: '0.6.9' })

const root = document.getElementById('app')
if (root === null) throw new Error('missing #app')
root.textContent = ''

const style = document.createElement('style')
style.textContent = `${xtermCss}
${panelCss}
html, body, #app { height: 100%; margin: 0; background: #0f1115; }
body { overflow: hidden; }
.ait-panel { --ait-bg: #1e1e1e; --ait-fg: #d4d4d4; }
.ait-panel[data-light="false"] .ait-terminal-card { background: var(--ait-bg); }
.ait-panel .ait-host { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.ait-panel .ait-empty-open { display: inline-flex; }
`
document.head.appendChild(style)

const SVG = {
  terminal:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3"/><path d="M13 15h4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c5 0 8.5 4.2 9.5 7-.4 1.1-1.2 2.3-2.2 3.3"/><path d="M6.2 6.2C4.4 7.5 3 9.6 2.5 12c1 2.8 4.5 7 9.5 7 1.6 0 3-.4 4.2-1.1"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12C3.5 9.2 7 5 12 5s8.5 4.2 9.5 7c-1 2.8-4.5 7-9.5 7S3.5 14.8 2.5 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V14"/><path d="M17 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a7 7 0 0 1-7-7v-3a1.5 1.5 0 0 1 3 0"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>',
}

function icon(name: keyof typeof SVG): string {
  return SVG[name]
}

const panel = document.createElement('div')
panel.className = 'ait-panel'
panel.dataset['light'] = 'false'

const tabsBar = document.createElement('div')
tabsBar.className = 'ait-panel-tabs'
const mark = document.createElement('div')
mark.className = 'ait-panel-mark'
mark.innerHTML = icon('terminal')
const title = document.createElement('div')
title.className = 'ait-panel-title'
title.textContent = '终端'
const tabScroll = document.createElement('div')
tabScroll.className = 'ait-panel-tab-scroll'
const addButton = document.createElement('button')
addButton.className = 'ait-panel-add'
addButton.title = 'New terminal'
addButton.innerHTML = icon('plus')
tabsBar.append(mark, title, tabScroll, addButton)

const body = document.createElement('div')
body.className = 'ait-panel-body'
const pane = document.createElement('div')
pane.className = 'ait-pane'
pane.dataset['active'] = 'true'
const terminal = document.createElement('div')
terminal.className = 'ait-terminal'
terminal.dataset['agentActive'] = 'false'
const card = document.createElement('div')
card.className = 'ait-terminal-card'
const bar = document.createElement('div')
bar.className = 'ait-bar'
const stateChip = document.createElement('div')
stateChip.className = 'ait-state'
stateChip.dataset['state'] = 'connecting'
const stateDot = document.createElement('span')
stateDot.className = 'dot'
const stateText = document.createElement('span')
stateText.className = 'ait-state-text'
stateText.textContent = 'Connecting…'
stateChip.append(stateDot, stateText)
const actions = document.createElement('div')
actions.className = 'ait-actions'
const handButton = document.createElement('button')
handButton.className = 'ait-icon'
handButton.dataset['tip'] = 'Take over'
handButton.innerHTML = icon('hand')
const lockButton = document.createElement('button')
lockButton.className = 'ait-icon'
lockButton.dataset['tip'] = 'Make read-only'
lockButton.innerHTML = icon('unlock')
const sealButton = document.createElement('button')
sealButton.className = 'ait-icon'
sealButton.dataset['tip'] = 'Disconnect agent'
sealButton.innerHTML = icon('eye')
actions.append(handButton, lockButton, sealButton)
bar.append(stateChip, actions)
const pendingBar = document.createElement('div')
pendingBar.className = 'ait-pending'
pendingBar.style.display = 'none'
const idleBar = document.createElement('div')
idleBar.className = 'ait-idle'
idleBar.style.display = 'none'
bar.appendChild(idleBar)
const stage = document.createElement('div')
stage.className = 'ait-stage'
const host = document.createElement('div')
host.className = 'ait-host'
stage.append(host)
card.append(bar, pendingBar, stage)
terminal.append(card)
pane.append(terminal)

const empty = document.createElement('div')
empty.className = 'ait-panel-empty'
empty.innerHTML = `${icon('terminal')}<div class="ait-empty-title">没有打开的终端</div><div class="ait-empty-hint">打开一个 shell，或者让 agent 在对话里打开一个。</div>`
const emptyOpen = document.createElement('button')
emptyOpen.className = 'ait-panel-open'
emptyOpen.textContent = '打开终端'
empty.append(emptyOpen)

body.append(pane, empty)
terminal.style.display = 'none'
pane.style.display = 'none'
empty.style.display = 'flex'
panel.append(tabsBar, body)
root.appendChild(panel)

let sessions: Array<Record<string, unknown>> = []
let activeId: string | null = null
let currentStatus: Record<string, unknown> | null = null
let term: Terminal | null = null
let fit: FitAddon | null = null
let cursor = 0
let disposed = false
let sending = false
let pending = ''
let noticeTimer = 0
let resizeTimer = 0
let pollTimer = 0
let handbackTimer = 0
let switching = false
let lastState = ''
let autoOpened = false
let creating = false
const seenRevision = new Map<string, number>()

function showState(text: string, state: string): void {
  stateText.textContent = text
  stateChip.dataset['state'] = state
  stateChip.title = text
}

function showNotice(message: string, ms = 3500): void {
  if (noticeTimer !== 0) clearTimeout(noticeTimer)
  if (message === '') return
  const toast = document.createElement('div')
  toast.className = 'ait-toast'
  toast.textContent = message
  card.appendChild(toast)
  noticeTimer = window.setTimeout(() => { toast.remove(); noticeTimer = 0 }, ms)
}

function textOf(result: { content?: Array<{ type: string; text?: string }>; isError?: boolean }): string {
  const block = result.content?.find((item) => item.type === 'text')
  return block?.text ?? 'tool call failed'
}

async function call(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const result = await app.callServerTool({ name, arguments: args })
  if (result.isError === true) throw new Error(textOf(result))
  return (result.structuredContent as Record<string, unknown> | undefined) ?? {}
}

function sessionIdOf(session: Record<string, unknown>): string {
  return String(session['id'] ?? '')
}

function sessionLabel(session: Record<string, unknown>): string {
  const name = session['name']
  return typeof name === 'string' && name.trim() !== '' ? name : `终端 ${sessionIdOf(session)}`
}

function stateFor(value: Record<string, unknown>): { state: string; text: string } {
  const phase = String(value['phase'] ?? '')
  const access = String(value['access'] ?? 'collaborate')
  const holder = String(value['holder'] ?? 'agent')
  if (phase === 'exited') return { state: 'exited', text: 'Shell exited' }
  if (access === 'sealed') return { state: 'sealed', text: 'Agent disconnected' }
  if (value['suspended'] === true) return { state: 'secret', text: 'Waiting for password' }
  if (access === 'observe') return { state: 'observe', text: 'Read-only' }
  if (holder === 'human') return { state: 'human', text: 'You have control' }
  if (phase === 'waiting_input') return { state: 'typing', text: 'Waiting for input' }
  if (phase === 'running') return { state: 'typing', text: 'Agent running' }
  return { state: 'agent', text: 'Agent ready' }
}

function renderTabs(): void {
  tabScroll.textContent = ''
  for (const session of sessions) {
    const id = sessionIdOf(session)
    const tab = document.createElement('div')
    tab.className = 'ait-panel-tab'
    tab.dataset['on'] = String(id === activeId)
    tab.dataset['phase'] = String(session['phase'] ?? '')
    const main = document.createElement('button')
    main.className = 'ait-panel-tab-main'
    main.title = sessionLabel(session)
    const dot = document.createElement('span')
    dot.className = 'ait-panel-tab-dot'
    dot.dataset['holder'] = String(session['holder'] ?? 'agent')
    dot.dataset['phase'] = String(session['phase'] ?? '')
    const label = document.createElement('span')
    label.className = 'ait-panel-tab-label'
    label.textContent = sessionLabel(session)
    main.append(dot, label)
    main.onclick = () => {
      if (id !== activeId) void attach(id)
    }
    const close = document.createElement('button')
    close.className = 'ait-panel-tab-close'
    close.title = 'Close terminal'
    close.innerHTML = icon('close')
    close.onclick = (event) => {
      event.stopPropagation()
      void closeSession(id)
    }
    tab.append(main, close)
    tabScroll.appendChild(tab)
  }
}

function renderPending(value: Record<string, unknown>): void {
  const items = Array.isArray(value['pendingCommands']) ? value['pendingCommands'] : []
  pendingBar.textContent = ''
  if (items.length === 0) {
    pendingBar.style.display = 'none'
    return
  }
  pendingBar.style.display = 'flex'
  const first = items[0]
  const command =
    typeof first === 'object' && first !== null ? String((first as Record<string, unknown>)['command'] ?? '') : ''
  const tag = document.createElement('span')
  tag.className = 'ait-pending-tag'
  tag.textContent = 'QUEUED'
  const text = document.createElement('span')
  text.className = 'ait-pending-text'
  text.textContent = command
  const count = document.createElement('span')
  count.className = 'ait-pending-count'
  count.textContent = items.length > 1 ? `+${items.length - 1}` : ''
  const cancel = document.createElement('button')
  cancel.className = 'ait-pending-cancel'
  cancel.textContent = 'Cancel'
  cancel.onclick = () => {
    if (activeId === null) return
    const id =
      typeof first === 'object' && first !== null && typeof (first as Record<string, unknown>)['id'] === 'number'
        ? Number((first as Record<string, unknown>)['id'])
        : undefined
    void call('terminal_ui_action', {
      sessionId: activeId,
      action: 'cancel-pending',
      ...(id === undefined ? {} : { id }),
    })
      .then((status) => updateStatus(status))
      .catch((error: unknown) => showNotice(error instanceof Error ? error.message : String(error)))
  }
  pendingBar.append(tag, text, count, cancel)
}

function updateStatus(value: Record<string, unknown>): void {
  currentStatus = value
  const display = stateFor(value)
  showState(display.text, display.state)
  const access = String(value['access'] ?? 'collaborate')
  const holder = String(value['holder'] ?? 'agent')
  const sealed = access === 'sealed'
  const observe = access === 'observe'
  lockButton.dataset['on'] = String(observe)
  lockButton.dataset['tip'] = observe ? 'Let the agent type' : 'Make read-only'
  lockButton.innerHTML = icon(observe ? 'lock' : 'unlock')
  sealButton.dataset['on'] = String(sealed)
  sealButton.dataset['tip'] = sealed ? 'Reconnect agent' : 'Disconnect agent'
  sealButton.innerHTML = icon(sealed ? 'eyeOff' : 'eye')
  handButton.dataset['on'] = String(holder === 'human')
  handButton.dataset['tip'] = holder === 'human' ? 'Hand back to agent' : 'Take over'
  terminal.dataset['agentActive'] = String(holder !== 'human' && value['suspended'] !== true && value['phase'] !== 'exited')
  const idle = holder === 'human' && value['suspended'] !== true && value['phase'] !== 'exited'
  idleBar.style.display = idle ? 'block' : 'none'
  if (idle) {
    idleBar.style.animation = 'none'
    void idleBar.offsetWidth
    idleBar.style.animation = 'ait-idle 4000ms linear forwards'
  }
  lastState = display.state
  renderPending(value)
  renderTabs()
}

function disposeTerm(): void {
  if (handbackTimer !== 0) {
    clearTimeout(handbackTimer)
    handbackTimer = 0
  }
  if (term !== null) {
    try { term.dispose() } catch { /* already disposed */ }
    term = null
    fit = null
  }
  host.textContent = ''
  cursor = 0
}

async function attach(id: string): Promise<void> {
  if (switching) return
  switching = true
  try {
    activeId = id
    disposeTerm()
    const initial = await call('terminal_ui_attach', { sessionId: id })
    const ansi = typeof initial['ansi'] === 'string' ? initial['ansi'] : ''
    cursor = typeof initial['cursor'] === 'number' ? initial['cursor'] : 0
    const next = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.15,
      scrollback: 5000,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#f2f2f2',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        black: '#1e1e1e',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#e5c07b',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#dcdfe4',
        brightBlack: '#5c6370',
        brightRed: '#e06c75',
        brightGreen: '#98c379',
        brightYellow: '#e5c07b',
        brightBlue: '#61afef',
        brightMagenta: '#c678dd',
        brightCyan: '#56b6c2',
        brightWhite: '#ffffff',
      },
    })
    const addon = new FitAddon()
    next.loadAddon(addon)
    next.open(host)
    term = next
    fit = addon
    try { addon.fit() } catch { /* the panel may still be laying out */ }
    if (ansi !== '') next.write(ansi)
    if (initial['status'] !== undefined) {
      const value = initial['status'] as Record<string, unknown>
      updateStatus(value)
      if (typeof value['revision'] === 'number') seenRevision.set(id, value['revision'])
    }
    next.onData((data) => {
      if (activeId === null) return
      pending += data
      void flushWrites()
      if (handbackTimer !== 0) clearTimeout(handbackTimer)
      handbackTimer = window.setTimeout(() => {
        handbackTimer = 0
        if (activeId !== null && !disposed) void action('handback')
      }, 4000)
    })
    next.onResize(() => {
      if (activeId === null || term === null) return
      if (resizeTimer !== 0) clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        resizeTimer = 0
        if (activeId === null || term === null) return
        void call('terminal_ui_resize', { sessionId: activeId, cols: term.cols, rows: term.rows }).catch(() => {})
      }, 150)
    })
    terminal.style.display = 'flex'
    pane.style.display = 'flex'
    empty.style.display = 'none'
    void streamLoop(id, cursor)
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error))
  } finally {
    switching = false
  }
}

async function flushWrites(): Promise<void> {
  if (sending) return
  sending = true
  try {
    while (pending !== '' && activeId !== null && !disposed) {
      const data = pending
      pending = ''
      const value = await call('terminal_ui_write', { sessionId: activeId, data })
      updateStatus(value)
    }
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error))
  } finally {
    sending = false
  }
}

async function streamLoop(id: string, start: number): Promise<void> {
  let at = start
  while (!disposed && activeId === id) {
    let value: Record<string, unknown>
    try {
      value = await call('terminal_ui_stream', { sessionId: id, cursor: at, timeoutMs: 8000 })
    } catch (error) {
      if (!disposed && activeId === id) showNotice(error instanceof Error ? error.message : String(error))
      return
    }
    if (disposed || activeId !== id) return
    const chunks = Array.isArray(value['chunks']) ? value['chunks'] : []
    for (const chunk of chunks) {
      if (typeof chunk === 'string' && term !== null) term.write(chunk)
    }
    if (typeof value['cursor'] === 'number') at = value['cursor']
    if (value['status'] !== undefined) {
      const next = value['status'] as Record<string, unknown>
      updateStatus(next)
      if (typeof next['revision'] === 'number') seenRevision.set(id, next['revision'])
    }
    if ((value['status'] as Record<string, unknown> | undefined)?.['exited'] === true) {
      showState('Shell exited', 'exited')
      return
    }
  }
}

async function refreshSessions(): Promise<void> {
  try {
    const value = await call('terminal_ui_list')
    const next = Array.isArray(value['sessions']) ? (value['sessions'] as Array<Record<string, unknown>>) : []
    const previousActive = activeId
    const human = currentStatus?.['holder'] === 'human'
    let candidate: string | null = null
    for (const session of next) {
      const id = sessionIdOf(session)
      const revision = typeof session['revision'] === 'number' ? session['revision'] : 0
      const old = seenRevision.get(id)
      if (old === undefined) {
        if (previousActive !== null && session['holder'] === 'agent') candidate = id
      } else if (revision > old && session['holder'] === 'agent' && !human) {
        candidate = id
      }
      seenRevision.set(id, revision)
    }
    for (const id of [...seenRevision.keys()]) {
      if (!next.some((session) => sessionIdOf(session) === id)) seenRevision.delete(id)
    }
    sessions = next
    if (sessions.length === 0) {
      activeId = null
      currentStatus = null
      disposeTerm()
      terminal.style.display = 'none'
      pane.style.display = 'none'
      empty.style.display = 'flex'
      showState('No terminal', 'exited')
      renderTabs()
      if (!autoOpened) {
        autoOpened = true
        void openTerminal()
      }
      return
    }
    if (activeId === null || !sessions.some((session) => sessionIdOf(session) === activeId)) {
      const target = candidate ?? sessionIdOf(sessions[sessions.length - 1]!)
      if (target !== '') await attach(target)
      return
    }
    if (candidate !== null && candidate !== activeId && !human) await attach(candidate)
    else renderTabs()
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error))
  }
}

async function openTerminal(): Promise<void> {
  if (creating) return
  creating = true
  try {
    const created = await call('terminal_ui_open', { cols: 120, rows: 30 })
    await refreshSessions()
    if (typeof created['id'] === 'string') await attach(String(created['id']))
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error))
  } finally {
    creating = false
  }
}

async function closeSession(id: string): Promise<void> {
  try {
    await call('terminal_ui_action', { sessionId: id, action: 'close' })
    if (activeId === id) {
      activeId = null
      currentStatus = null
      disposeTerm()
    }
    seenRevision.delete(id)
    await refreshSessions()
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error))
  }
}

async function action(name: string): Promise<void> {
  if (activeId === null) return
  try {
    const value = await call('terminal_ui_action', { sessionId: activeId, action: name })
    updateStatus(value)
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error))
  }
}

handButton.onclick = () => {
  if (activeId === null) return
  void action(currentStatus?.['holder'] === 'human' ? 'handback' : 'takeover')
}
lockButton.onclick = () => {
  if (activeId === null) return
  void action(currentStatus?.['access'] === 'observe' ? 'collaborate' : 'observe')
}
sealButton.onclick = () => {
  if (activeId === null) return
  void action(currentStatus?.['access'] === 'sealed' ? 'collaborate' : 'sealed')
}
addButton.onclick = () => {
  void openTerminal()
}
emptyOpen.onclick = () => {
  void openTerminal()
}
window.addEventListener('resize', () => {
  if (fit !== null) {
    try { fit.fit() } catch { /* not laid out yet */ }
  }
})

async function boot(): Promise<void> {
  try {
    await app.connect()
    showState('No terminal', 'exited')
    terminal.style.display = 'none'
    empty.style.display = 'flex'
    await refreshSessions()
    pollTimer = window.setInterval(() => { void refreshSessions() }, 1000)
  } catch (error) {
    showState('Unable to connect', 'sealed')
    terminal.style.display = 'none'
    pane.style.display = 'none'
    empty.style.display = 'flex'
    showNotice(error instanceof Error ? error.message : String(error), 0)
  }
}

window.addEventListener('beforeunload', () => {
  disposed = true
  if (pollTimer !== 0) window.clearInterval(pollTimer)
  disposeTerm()
})

void boot()
