/**
 * Standalone browser panel for agent-owned terminal sessions.
 *
 * This is the transport that other agent runtimes use when they do not have a
 * DSH-style web server to mount the panel into. It serves one HTML page, a
 * small JSON API, and a WebSocket attach stream on loopback. The token is
 * required for the page, the API, and the WebSocket; the static xterm assets
 * are public because they contain no session data.
 *
 * @module agent-interactive-terminal/panel
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAttachUpgrade, type AttachUpgrade } from '../attach.js'
import type { TerminalRegistry } from '../session/registry.js'
import type { TerminalSession } from '../session/session.js'

/** What a standalone panel needs to serve. */
export interface PanelServerOptions {
  registry: TerminalRegistry
  /** Port to listen on. Zero asks the operating system for a free port. */
  port?: number
  /** Interface to bind. Defaults to loopback. */
  host?: string
  /** Fixed token, mainly for tests. Defaults to 32 random bytes. */
  token?: string
}

/** A running panel server and the URL a person can open. */
export interface PanelServer {
  /** Full URL including the access token. */
  url: string
  token: string
  port: number
  close(): Promise<void>
}

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const MAX_BODY_BYTES = 64 * 1024

function asset(packageName: string, relative: string): string {
  return join(dirname(require.resolve(`${packageName}/package.json`)), relative)
}

const STATIC: Record<string, { file: string; type: string }> = {
  '/assets/xterm.js': { file: asset('@xterm/xterm', 'lib/xterm.js'), type: 'text/javascript; charset=utf-8' },
  '/assets/xterm.css': { file: asset('@xterm/xterm', 'css/xterm.css'), type: 'text/css; charset=utf-8' },
  '/assets/addon-fit.js': { file: asset('@xterm/addon-fit', 'lib/addon-fit.js'), type: 'text/javascript; charset=utf-8' },
}

function bearer(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return undefined
  return header.slice('Bearer '.length)
}

function sameToken(supplied: string | undefined, expected: string): boolean {
  if (supplied === undefined) return false
  const left = Buffer.from(supplied)
  const right = Buffer.from(expected)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function authorized(req: IncomingMessage, url: URL, token: string): boolean {
  return sameToken(url.searchParams.get('token') ?? bearer(req), token)
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function text(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    size += buffer.length
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

function summaryOf(session: TerminalSession): Record<string, unknown> {
  const size = session.size
  return {
    id: session.id,
    name: session.name ?? null,
    kind: session.kind,
    summary: session.capsuleLine(),
    phase: session.phase,
    cols: size.cols,
    rows: size.rows,
    agentAt: session.agentAt,
    holder: session.lease.holder,
    access: session.agentAccess,
  }
}

function intField(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined
}

/**
 * Start a panel server on loopback.
 *
 * @param options - registry to expose and optional bind details.
 * @returns the running server, its token, and its URL.
 */
export async function createPanelServer(options: PanelServerOptions): Promise<PanelServer> {
  const registry = options.registry
  const token = options.token ?? randomBytes(32).toString('hex')
  const host = options.host ?? '127.0.0.1'
  const page = await readFile(join(here, 'panel.html'), 'utf8')
  const open = (input: { cols?: number; rows?: number; kind?: 'agent' | 'user' }) => registry.open(input)

  const attach: AttachUpgrade = createAttachUpgrade({
    resolve: () => ({
      registry,
      open: (input) => open({ ...input, kind: 'user' }),
    }),
  })

  const server = createServer((req, res) => {
    void (async () => {
      let url: URL
      try {
        url = new URL(req.url ?? '/', `http://${host}`)
      } catch {
        text(res, 400, 'bad request')
        return
      }
      const path = url.pathname

      const assetEntry = STATIC[path]
      if (assetEntry !== undefined) {
        try {
          const body = await readFile(assetEntry.file)
          res.writeHead(200, {
            'content-type': assetEntry.type,
            'cache-control': 'public, max-age=3600',
            'content-length': body.length,
            'x-content-type-options': 'nosniff',
          })
          res.end(body)
        } catch {
          text(res, 404, 'asset not found')
        }
        return
      }

      if (!authorized(req, url, token)) {
        json(res, 401, { error: 'a valid panel token is required' })
        return
      }

      if (path === '/' && req.method === 'GET') {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'content-security-policy':
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:",
          'x-content-type-options': 'nosniff',
        })
        res.end(page)
        return
      }

      if (path === '/api/state' && req.method === 'GET') {
        json(res, 200, { sessions: registry.list().map(summaryOf) })
        return
      }

      if (path === '/api/open' && req.method === 'POST') {
        const body = (await readJson(req)) ?? {}
        try {
          const session = await registry.open({
            cols: intField(body['cols'], 20, 400) ?? 100,
            rows: intField(body['rows'], 5, 200) ?? 30,
            kind: 'user',
          })
          json(res, 201, summaryOf(session))
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : String(error) })
        }
        return
      }

      if (path === '/api/close' && req.method === 'POST') {
        const body = (await readJson(req)) ?? {}
        const id = typeof body['id'] === 'string' ? body['id'] : undefined
        if (id === undefined) {
          json(res, 400, { error: 'id is required' })
          return
        }
        json(res, 200, { closed: await registry.close(id) })
        return
      }

      if (path === '/api/screen' && req.method === 'GET') {
        const id = url.searchParams.get('id')
        if (id === null || id.length === 0) {
          json(res, 400, { error: 'id is required' })
          return
        }
        const session = registry.get(id)
        if (session === undefined) {
          json(res, 404, { error: `no terminal session ${id}` })
          return
        }
        const snapshot = session.snapshot({ mode: 'screen' })
        json(res, 200, {
          id: session.id,
          phase: snapshot.phase,
          revision: snapshot.revision,
          cols: snapshot.cols,
          rows: snapshot.rows,
          alt: snapshot.alt,
          cursor: snapshot.cursor,
          status: snapshot.status,
          lines: snapshot.lines ?? [],
        })
        return
      }

      if (path === '/api/health' && req.method === 'GET') {
        json(res, 200, { ok: true })
        return
      }

      json(res, 404, { error: 'unknown panel route' })
    })().catch((error: unknown) => {
      if (!res.headersSent) text(res, 500, error instanceof Error ? error.message : String(error))
      else res.end()
    })
  })

  server.on('upgrade', (req, socket, head) => {
    let url: URL
    try {
      url = new URL(req.url ?? '/', `http://${host}`)
    } catch {
      socket.destroy()
      return
    }
    if (url.pathname !== '/attach') {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      socket.destroy()
      return
    }
    if (!authorized(req, url, token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      socket.destroy()
      return
    }
    attach.handler(req, socket, head)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address() as AddressInfo
  const port = address.port
  const shownHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host
  const base = `http://${shownHost}:${port}/`

  return {
    url: `${base}?token=${encodeURIComponent(token)}`,
    token,
    port,
    async close(): Promise<void> {
      attach.dispose()
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
