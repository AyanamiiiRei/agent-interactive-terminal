/**
 * Loopback HTTP bridge between the plugin's sessions and the DSH web page.
 *
 * The agent's tools and the right-sidebar panel meet on the same
 * `TerminalRegistry`: the tools act as one client, the panel as another, and
 * each one sees the other's output because both read the same screen model.
 * The panel never talks to a subprocess directly, so a session opened by the
 * agent is immediately visible to the person, and a session opened from the
 * panel can be driven by the agent's tools by id.
 *
 * The routes live under `/plugins/agent-interactive-terminal` on the Host web
 * server. They accept only loopback requests with the same-origin check the
 * other in-page plugins use, because the payload can type into a live shell.
 *
 * @module agent-interactive-terminal/bridge
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { NamedKey } from './types.js'
import type { TerminalRegistry } from './session/registry.js'
import type { TerminalSession } from './session/session.js'

/** One DSH session's live terminal registry, resolved from the request. */
export interface BridgeTarget {
  registry: TerminalRegistry
  /** Open a session for the person, honouring the plugin's shell choice. */
  open(options: { cols?: number; rows?: number; kind?: 'agent' | 'user' }): Promise<TerminalSession>
}

/** What the bridge needs from the plugin. */
export interface BridgeDeps {
  /**
   * Resolve the live Agent that owns one DSH session id.
   * @param sessionId - DSH session identity supplied by the page.
   * @returns the registry face, or undefined when the session is not live.
   */
  resolve(sessionId: string): BridgeTarget | undefined
}

/** Named keys the bridge accepts from the page. */
const KEYS = new Set<NamedKey>([
  'enter',
  'tab',
  'escape',
  'backspace',
  'delete',
  'up',
  'down',
  'left',
  'right',
  'home',
  'end',
  'page-up',
  'page-down',
  'ctrl-a',
  'ctrl-b',
  'ctrl-c',
  'ctrl-d',
  'ctrl-e',
  'ctrl-k',
  'ctrl-l',
  'ctrl-r',
  'ctrl-u',
  'ctrl-w',
  'ctrl-z',
])

const MAX_BODY_BYTES = 64 * 1024
const MAX_INPUT_CHARS = 8192

/**
 * Reject requests that did not come from the local page.
 *
 * @param req - incoming request.
 * @returns whether the request is a loopback, same-origin request.
 */
export function isLocalRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  if (req.headers.host !== undefined) {
    try {
      const host = new URL(`http://${req.headers.host}`)
      if (host.username !== '' || host.password !== '') return false
      if (host.hostname !== '127.0.0.1' && host.hostname !== 'localhost' && host.hostname !== '[::1]') {
        return false
      }
    } catch {
      return false
    }
  }
  if (req.headers.origin === undefined) return true
  try {
    const origin = new URL(req.headers.origin)
    return (origin.protocol === 'http:' || origin.protocol === 'https:') && origin.host === req.headers.host
  } catch {
    return false
  }
}

/**
 * Write one JSON response.
 *
 * @param res - response to own.
 * @param status - HTTP status code.
 * @param body - JSON-serializable payload.
 */
function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

/**
 * Read a bounded JSON request body.
 *
 * @param req - request to read.
 * @returns the parsed object, or undefined when the body is missing or invalid.
 */
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

/**
 * Validate one query parameter.
 *
 * @param params - parsed query.
 * @param name - parameter name.
 * @returns the value, or undefined when absent or empty.
 */
function param(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name)
  return value === null || value.length === 0 ? undefined : value
}

/**
 * Read one bounded integer field.
 *
 * @param body - request body.
 * @param name - field name.
 * @param min - smallest accepted value.
 * @param max - largest accepted value.
 * @returns the integer, or undefined when absent or out of range.
 */
function intField(body: Record<string, unknown>, name: string, min: number, max: number): number | undefined {
  const value = body[name]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return undefined
  return value
}

/**
 * Summarize one session for the panel's list.
 *
 * @param session - live session.
 * @returns the fields the panel needs to list and select it.
 */
function summaryOf(session: TerminalSession): Record<string, unknown> {
  const capsule = session.capsuleLine()
  const snapshot = session.snapshot({ mode: 'screen' })
  return {
    id: session.id,
    name: session.name ?? null,
    kind: session.kind,
    summary: capsule,
    phase: snapshot.phase,
    cols: snapshot.cols,
    rows: snapshot.rows,
    alt: snapshot.alt,
  }
}

/**
 * Build the bridge request handler.
 *
 * The returned handler owns the full response lifecycle for one prefix route;
 * the plugin registers it on the Host web server.
 *
 * @param deps - session resolution.
 * @returns an HTTP handler for every `/plugins/agent-interactive-terminal` path.
 */
export function createBridgeHandler(deps: BridgeDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (!isLocalRequest(req)) {
      json(res, 403, { error: 'local requests only' })
      return
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const suffix = url.pathname.replace(/^\/plugins\/agent-interactive-terminal/, '') || '/'
    const sessionId = param(url.searchParams, 'sessionId') ?? ''
    if (sessionId === '') {
      json(res, 400, { error: 'sessionId is required' })
      return
    }
    const target = deps.resolve(sessionId)
    if (target === undefined) {
      json(res, 404, { error: 'no live agent for that session' })
      return
    }

    if (suffix === '/state' && req.method === 'GET') {
      json(res, 200, { sessions: target.registry.list().map(summaryOf) })
      return
    }

    if (suffix === '/screen' && req.method === 'GET') {
      const id = param(url.searchParams, 'id')
      if (id === undefined) {
        json(res, 400, { error: 'id is required' })
        return
      }
      const session = target.registry.get(id)
      if (session === undefined) {
        json(res, 404, { error: `no terminal session ${id}` })
        return
      }
      const snapshot = session.snapshot({ mode: 'screen' })
      json(res, 200, {
        id: session.id,
        name: session.name ?? null,
        phase: snapshot.phase,
        cols: snapshot.cols,
        rows: snapshot.rows,
        alt: snapshot.alt,
        revision: snapshot.revision,
        cursor: snapshot.cursor,
        status: snapshot.status,
        lines: snapshot.lines ?? [],
      })
      return
    }

    if (req.method !== 'POST') {
      json(res, 405, { error: 'method not allowed' })
      return
    }
    const body = await readJson(req)
    if (body === undefined) {
      json(res, 400, { error: 'invalid JSON body' })
      return
    }

    try {
      if (suffix === '/send') {
        const id = typeof body['id'] === 'string' ? body['id'] : undefined
        const text = typeof body['text'] === 'string' ? body['text'] : undefined
        if (id === undefined || text === undefined || text.length > MAX_INPUT_CHARS) {
          json(res, 400, { error: 'id and bounded text are required' })
          return
        }
        const session = target.registry.get(id)
        if (session === undefined) {
          json(res, 404, { error: `no terminal session ${id}` })
          return
        }
        await session.write(text, { submit: body['submit'] !== false, origin: 'human' })
        json(res, 200, { ok: true })
        return
      }

      if (suffix === '/key') {
        const id = typeof body['id'] === 'string' ? body['id'] : undefined
        const key = typeof body['key'] === 'string' ? (body['key'] as NamedKey) : undefined
        if (id === undefined || key === undefined || !KEYS.has(key)) {
          json(res, 400, { error: 'id and a known key are required' })
          return
        }
        const session = target.registry.get(id)
        if (session === undefined) {
          json(res, 404, { error: `no terminal session ${id}` })
          return
        }
        await session.press(key, intField(body, 'repeat', 1, 50) ?? 1)
        json(res, 200, { ok: true })
        return
      }

      if (suffix === '/resize') {
        const id = typeof body['id'] === 'string' ? body['id'] : undefined
        const cols = intField(body, 'cols', 2, 400)
        const rows = intField(body, 'rows', 2, 200)
        if (id === undefined || cols === undefined || rows === undefined) {
          json(res, 400, { error: 'id, cols and rows are required' })
          return
        }
        const session = target.registry.get(id)
        if (session === undefined) {
          json(res, 404, { error: `no terminal session ${id}` })
          return
        }
        session.resize(cols, rows)
        json(res, 200, { ok: true })
        return
      }

      if (suffix === '/close') {
        const id = typeof body['id'] === 'string' ? body['id'] : undefined
        if (id === undefined) {
          json(res, 400, { error: 'id is required' })
          return
        }
        json(res, 200, { closed: await target.registry.close(id) })
        return
      }

      if (suffix === '/open') {
        const cols = intField(body, 'cols', 20, 400) ?? 100
        const rows = intField(body, 'rows', 5, 200) ?? 30
        const session = await target.open({ cols, rows, kind: 'user' })
        json(res, 201, summaryOf(session))
        return
      }

      json(res, 404, { error: 'unknown bridge route' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      json(res, 400, { error: message })
    }
  }
}
