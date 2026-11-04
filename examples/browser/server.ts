/**
 * Browser attach demo: one session, rendered by xterm.js, shared between the
 * page and the agent-facing library. Read-only until a person takes over.
 *
 * This is an example, not a production transport: it has no authentication,
 * binds to loopback, and serves xterm.js from the local node_modules.
 *
 *   npm run attach        then open the printed URL
 */
import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, type WebSocket } from 'ws'
import { TerminalRegistry } from '../../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const xtermRoot = dirname(require.resolve('@xterm/xterm/package.json'))
const fitRoot = dirname(require.resolve('@xterm/addon-fit/package.json'))

const registry = new TerminalRegistry({ maxSessions: 1 })
const session = await registry.open({ name: 'browser', cols: 100, rows: 30 })

const STATIC: Record<string, { file: string; type: string }> = {
  '/': { file: join(here, 'public/index.html'), type: 'text/html; charset=utf-8' },
  '/xterm.js': { file: join(xtermRoot, 'lib/xterm.js'), type: 'text/javascript; charset=utf-8' },
  '/xterm.css': { file: join(xtermRoot, 'css/xterm.css'), type: 'text/css; charset=utf-8' },
  '/addon-fit.js': {
    file: join(fitRoot, 'lib/addon-fit.js'),
    type: 'text/javascript; charset=utf-8',
  },
}

const server = createServer((request: IncomingMessage, response: ServerResponse) => {
  const entry = STATIC[request.url ?? '/']
  if (!entry) {
    response.writeHead(404, { 'content-type': 'text/plain' })
    response.end('not found')
    return
  }
  void readFile(entry.file)
    .then((body) => {
      response.writeHead(200, { 'content-type': entry.type })
      response.end(body)
    })
    .catch(() => {
      response.writeHead(500, { 'content-type': 'text/plain' })
      response.end(`missing ${entry.file}`)
    })
})

const wss = new WebSocketServer({ server, path: '/attach' })
const clients = new Set<WebSocket>()

type ServerMessage =
  | { type: 'hello'; id: string; cols: number; rows: number; shell: string }
  | { type: 'status'; phase: string; lease: string; suspended: boolean; writable: boolean; revision: number }
  | { type: 'snapshot'; data: string }
  | { type: 'output'; data: string }
  | { type: 'denied'; reason: string }

function send(client: WebSocket, message: ServerMessage): void {
  if (client.readyState === 1) client.send(JSON.stringify(message))
}

function broadcast(message: ServerMessage): void {
  for (const client of clients) send(client, message)
}

function writable(): boolean {
  return session.lease.holder === 'human' && !session.lease.suspended
}

function statusMessage(): ServerMessage {
  const lease = session.lease
  return {
    type: 'status',
    phase: session.phase,
    lease: lease.holder,
    suspended: lease.suspended,
    writable: writable(),
    revision: session.revision,
  }
}

let statusTimer: NodeJS.Timeout | undefined
const unsubscribeStatus = session.subscribe(() => {
  if (statusTimer !== undefined) return
  statusTimer = setTimeout(() => {
    statusTimer = undefined
    broadcast(statusMessage())
  }, 40)
})

const unsubscribeOutput = session.onOutput((data) => {
  broadcast({ type: 'output', data })
})

wss.on('connection', (client: WebSocket) => {
  clients.add(client)
  send(client, {
    type: 'hello',
    id: session.id,
    cols: session.size.cols,
    rows: session.size.rows,
    shell: session.statusLine(),
  })
  send(client, { type: 'snapshot', data: session.serialize() })
  send(client, statusMessage())

  client.on('message', (raw) => {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(String(raw)) as Record<string, unknown>
    } catch {
      return
    }
    const type = message.type
    if (type === 'takeover') {
      session.takeOver()
      return
    }
    if (type === 'handback') {
      session.handBack()
      return
    }
    if (type === 'resize') {
      const cols = Number(message.cols)
      const rows = Number(message.rows)
      if (Number.isInteger(cols) && Number.isInteger(rows) && cols >= 2 && rows >= 2) {
        session.resize(cols, rows)
      }
      return
    }
    if (type === 'write') {
      if (!writable()) {
        send(client, { type: 'denied', reason: 'take over the session first' })
        return
      }
      const data = typeof message.data === 'string' ? message.data : ''
      if (data.length === 0) return
      void session.write(data, { origin: 'human', submit: false }).catch((error: unknown) => {
        send(client, { type: 'denied', reason: (error as Error).message })
      })
    }
  })

  client.on('close', () => {
    clients.delete(client)
  })
})

const port = Number(process.env['AIT_PORT'] ?? 7787)
server.listen(port, '127.0.0.1', () => {
  console.log(`attach demo: http://127.0.0.1:${port}/`)
  console.log(`session ${session.id} is ${session.phase}; the page is read-only until take over`)
})

async function shutdown(): Promise<void> {
  unsubscribeOutput()
  unsubscribeStatus()
  wss.close()
  await registry.closeAll()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1500)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
