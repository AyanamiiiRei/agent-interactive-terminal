/**
 * WebSocket attach stream for the browser terminal.
 *
 * The right-sidebar panel is a real terminal emulator, not a log viewer: it
 * writes raw keystrokes into the same PTY the agent drives, and renders the
 * byte stream with xterm.js. The initial paint is an ANSI snapshot of the
 * session's screen model, taken from the same `@xterm/headless` screen the
 * agent's projections use, so the page and the model never disagree about
 * what is on screen.
 *
 * One socket carries one session. Control messages are JSON text frames;
 * terminal output is binary frames, because it is not JSON and must not be
 * escaped. The Host web server owns the upgrade route, so the page connects
 * to the same origin it was served from and no second port is exposed.
 *
 * @module agent-interactive-terminal/attach
 */
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import { isLocalRequest } from './bridge.js'
import type { BridgeDeps } from './bridge.js'
import type { TerminalSession } from './session/session.js'

/** What a text frame from the page may ask for. */
type ClientMessage =
  | { type: 'write'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'takeover' }
  | { type: 'handback' }
  | { type: 'ping' }

/** One attach route: the upgrade handler plus a disposer for unload. */
export interface AttachUpgrade {
  handler(req: IncomingMessage, socket: Duplex, head: Buffer): void
  dispose(): void
}

/**
 * Answer an upgrade we refuse with a plain HTTP response, then drop the
 * socket. A WebSocket client surfaces this as a failed connection.
 *
 * @param socket - the raw socket the upgrade arrived on.
 * @param status - HTTP status code.
 * @param reason - HTTP reason phrase.
 */
function reject(socket: Duplex, status: number, reason: string): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  socket.destroy()
}

/**
 * Build the attach upgrade handler for one Host.
 *
 * @param deps - the same session resolver the HTTP bridge uses.
 * @returns the upgrade handler and a disposer that closes every socket.
 */
export function createAttachUpgrade(deps: BridgeDeps): AttachUpgrade {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false })
  const clients = new Set<WebSocket>()
  const cleanups = new Set<() => void>()
  let disposed = false

  wss.on('connection', (client: WebSocket) => {
    clients.add(client)
    client.on('close', () => clients.delete(client))
  })

  function attach(client: WebSocket, session: TerminalSession): void {
    let ready = false
    let finished = false
    let tail = ''
    const pending: string[] = []
    let statusTimer: NodeJS.Timeout | undefined
    let unsubscribeOutput: (() => void) | undefined
    let unsubscribeStatus: (() => void) | undefined

    const send = (message: object): void => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message))
    }
    const sendOutput = (data: string): void => {
      if (client.readyState === WebSocket.OPEN) client.send(Buffer.from(data, 'utf8'), { binary: true })
    }
    const statusMessage = () => ({
      type: 'status',
      phase: session.phase,
      lease: session.lease,
      cols: session.size.cols,
      rows: session.size.rows,
      revision: session.revision,
      command: session.agentCommand,
      commandAt: session.agentCommandAt,
    })
    const broadcastStatus = (): void => {
      if (statusTimer !== undefined) return
      statusTimer = setTimeout(() => {
        statusTimer = undefined
        send(statusMessage())
      }, 40)
    }
    const cleanup = (): void => {
      if (statusTimer !== undefined) clearTimeout(statusTimer)
      statusTimer = undefined
      unsubscribeOutput?.()
      unsubscribeOutput = undefined
      unsubscribeStatus?.()
      unsubscribeStatus = undefined
      cleanups.delete(cleanup)
      // When the person's view goes away, the keyboard belongs to the agent
      // again. Without this a closed browser would hold the lease forever and
      // every agent write would be refused.
      if (session.phase !== 'exited' && session.lease.holder === 'human') {
        try {
          session.handBack()
        } catch {
          // The session may have exited between the check and the call.
        }
      }
    }
    const finish = (): void => {
      if (finished) return
      finished = true
      send({
        type: 'exited',
        phase: session.phase,
        exitCode: session.exitCode,
        signal: session.exitSignal,
        closedByOwner: session.closedByOwner,
        cols: session.size.cols,
        rows: session.size.rows,
        tail: tail.slice(-2048),
      })
      cleanup()
      if (client.readyState === WebSocket.OPEN) client.close()
    }

    // Subscribe before painting: output produced while the snapshot is being
    // serialized is buffered and flushed after it, so no byte is lost or
    // rendered out of order.
    unsubscribeOutput = session.onOutput((data) => {
      tail = (tail + data).slice(-4096)
      if (!ready) {
        pending.push(data)
        return
      }
      sendOutput(data)
    })
    unsubscribeStatus = session.subscribe(() => {
      if (session.phase === 'exited') {
        finish()
        return
      }
      broadcastStatus()
    })
    cleanups.add(cleanup)

    send({
      type: 'hello',
      id: session.id,
      name: session.name ?? session.id,
      cols: session.size.cols,
      rows: session.size.rows,
      phase: session.phase,
      lease: session.lease,
      shell: session.statusLine(),
    })
    send({ type: 'snapshot', data: session.serialize() })
    send(statusMessage())
    ready = true
    for (const chunk of pending.splice(0)) sendOutput(chunk)

    client.on('message', (raw, isBinary) => {
      if (isBinary) return
      let message: ClientMessage
      try {
        message = JSON.parse(String(raw)) as ClientMessage
      } catch {
        return
      }
      switch (message.type) {
        case 'write': {
          if (session.lease.holder !== 'human') {
            send({ type: 'denied', reason: 'lease is held by the agent; take over first' })
            return
          }
          const data = typeof message.data === 'string' ? message.data : ''
          if (data.length > 0) {
            void session.write(data, { origin: 'human', submit: false }).catch((error: unknown) => {
              send({ type: 'denied', reason: error instanceof Error ? error.message : String(error) })
            })
          }
          return
        }
        case 'resize': {
          if (Number.isInteger(message.cols) && Number.isInteger(message.rows) && message.cols >= 2 && message.rows >= 2) {
            try {
              session.resize(message.cols, message.rows)
            } catch {
              // A session that exited between the message and the resize.
            }
          }
          return
        }
        case 'takeover': {
          try {
            session.takeOver()
          } catch {
            // The shell exited while the click was in flight.
          }
          return
        }
        case 'handback': {
          try {
            session.handBack()
          } catch {
            // The shell exited while the click was in flight.
          }
          return
        }
        case 'ping': {
          send({ type: 'pong' })
          return
        }
        default:
          return
      }
    })
    client.on('close', () => cleanup())
    client.on('error', () => cleanup())
  }

  return {
    handler(req: IncomingMessage, socket: Duplex, head: Buffer): void {
      if (disposed) return reject(socket, 503, 'Service Unavailable')
      if (!isLocalRequest(req)) return reject(socket, 403, 'Forbidden')
      let url: URL
      try {
        url = new URL(req.url ?? '/', 'http://localhost')
      } catch {
        return reject(socket, 400, 'Bad Request')
      }
      const sessionId = url.searchParams.get('sessionId') ?? ''
      const id = url.searchParams.get('id') ?? ''
      const target = deps.resolve(sessionId)
      const session = target?.registry.get(id)
      if (session === undefined) return reject(socket, 404, 'Not Found')
      try {
        wss.handleUpgrade(req, socket, head, (client) => attach(client, session))
      } catch {
        socket.destroy()
      }
    },
    dispose(): void {
      disposed = true
      for (const cleanup of [...cleanups]) cleanup()
      for (const client of [...clients]) client.close()
      clients.clear()
      wss.close()
    },
  }
}
