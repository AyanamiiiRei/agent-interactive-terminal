/**
 * Codex MCP App transport.
 *
 * This is the only place that knows how the Codex panel talks to the shared
 * core: app-only MCP tools. The DSH adapter has its own WebSocket transport,
 * and neither adapter imports the other.
 */

function statusMessage(status) {
  return {
    type: 'status',
    ...status,
    lease: { holder: status.holder, suspended: status.suspended === true },
    pending: Array.isArray(status.pendingCommands) ? status.pendingCommands : [],
  }
}

function showSocketError(message) {
  let banner = document.getElementById('ait-socket-error')
  if (banner === null) {
    banner = document.createElement('pre')
    banner.id = 'ait-socket-error'
    banner.style.cssText =
      'position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;margin:0;padding:8px;border:1px solid #e06c75;border-radius:6px;background:#2b1418;color:#ffb4bd;font:11px/1.4 monospace;white-space:pre-wrap;max-height:40%;overflow:auto'
    document.body.appendChild(banner)
  }
  banner.textContent = `terminal socket: ${message}`
}

/**
 * Build the MCP-backed transport for the shared DSH React panel.
 *
 * @param {(name: string, args?: Record<string, unknown>) => Promise<Record<string, unknown>>} call
 */
export function createMcpTransport(call) {
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
      this.onmessage?.({ data: new TextEncoder().encode(text).buffer })
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
        showSocketError(message)
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

  return { McpSocket, api }
}
