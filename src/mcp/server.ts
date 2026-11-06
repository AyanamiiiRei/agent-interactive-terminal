/**
 * Model Context Protocol server for the terminal tools.
 *
 * MCP clients such as Codex, ChatGPT desktop, Claude Code, Kimi Code, and ZCode
 * spawn this process over stdio. The eight agent tools are the same definitions
 * the DSH bundle registers. The server also exposes an MCP App panel for the
 * conversation side panel and a small set of app-only tools that drive it.
 *
 * @module agent-interactive-terminal/mcp
 */
import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { loadPanelAppHtml } from '../panel/app-html.js'
import { createPanelServer, type PanelServer } from '../panel/server.js'
import { TerminalRegistry } from '../session/registry.js'
import type { TerminalSession } from '../session/session.js'
import { createTerminalTools } from '../tools/index.js'
import type { WaitResult } from '../types.js'
import type { McpTool, McpToolResult } from './tool.js'
import { createUiTools, disposeUiTaps, UI_MIME, UI_URI } from './ui.js'

/** Options for {@link runMcpServer}. */
export interface McpServerOptions {
  registry?: TerminalRegistry
  /** Set false to run without a browser panel. */
  panel?: boolean
  panelPort?: number
  panelToken?: string
  /** How long `terminal_send` waits for a person to finish at the keyboard. */
  blockHumanMs?: number
}

interface RpcRequest {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: unknown
}

interface ToolCallParams {
  name?: unknown
  arguments?: unknown
}

const SERVER_NAME = 'agent-interactive-terminal'
const SERVER_VERSION = '0.6.9'
const DEFAULT_PROTOCOL = '2025-06-18'

function writeStderr(message: string): void {
  process.stderr.write(`[ait-mcp] ${message}\n`)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code
    return typeof code === 'string' ? `[${code}] ${error.message}` : error.message
  }
  return String(error)
}

function waitText(waited: WaitResult): string {
  const body = waited.view.text.length > 0 ? waited.view.text : '(no visible output)'
  return `${body}\n[wait: ${waited.outcome}] [phase: ${waited.phase}] [elapsed: ${waited.elapsedMs}ms]\n${waited.status}`
}

function textResult(text: string, isError = false): McpToolResult {
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  }
}

/**
 * Run the MCP server until stdin closes or the client asks it to exit.
 *
 * @param options - registry and panel overrides, mainly for tests.
 */
export async function runMcpServer(options: McpServerOptions = {}): Promise<void> {
  const registry = options.registry ?? new TerminalRegistry({ maxSessions: 4 })
  const agentTools = createTerminalTools(registry)
  const tools: McpTool[] = [
    ...agentTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters,
      async execute(input: Record<string, unknown>): Promise<McpToolResult> {
        return textResult((await tool.execute(input)).text)
      },
    })),
    ...createUiTools(registry),
  ]
  const byName = new Map(tools.map((tool) => [tool.name, tool]))
  const panelEnabled = options.panel ?? process.env['AIT_PANEL'] !== '0'
  const blockHumanMs =
    options.blockHumanMs ?? Math.max(0, Number(process.env['AIT_BLOCK_HUMAN_MS'] ?? 25_000) || 0)
  let panel: PanelServer | undefined
  let panelPromise: Promise<PanelServer | undefined> | undefined
  let closed = false
  let appHtml: string | undefined

  const send = (message: unknown): void => {
    if (closed) return
    process.stdout.write(`${JSON.stringify(message)}\n`)
  }
  const respond = (id: string | number, result: unknown): void => {
    send({ jsonrpc: '2.0', id, result })
  }
  const fail = (id: string | number, code: number, message: string): void => {
    send({ jsonrpc: '2.0', id, error: { code, message } })
  }

  const ensurePanel = async (): Promise<PanelServer | undefined> => {
    if (!panelEnabled) return undefined
    if (panel !== undefined) return panel
    const envPort = process.env['AIT_PANEL_PORT']
    const requestedPort = options.panelPort ?? (envPort === undefined ? undefined : Number(envPort))
    const port =
      requestedPort !== undefined && Number.isInteger(requestedPort) && requestedPort >= 0
        ? requestedPort
        : undefined
    const token = options.panelToken ?? process.env['AIT_PANEL_TOKEN']
    panelPromise ??= createPanelServer({
      registry,
      ...(port === undefined ? {} : { port }),
      ...(token === undefined ? {} : { token }),
    })
      .then((server) => {
        panel = server
        writeStderr(`panel: ${server.url}`)
        return server
      })
      .catch((error: unknown) => {
        panelPromise = undefined
        writeStderr(`panel unavailable: ${errorText(error)}`)
        return undefined
      })
    return panelPromise
  }

  /**
   * After a write is queued or a password prompt suspends the agent, wait for
   * the person to release the keyboard and for the command to settle. This is
   * the MCP substitute for the DSH host's automatic wake message.
   */
  const waitForPerson = async (session: TerminalSession, text: string): Promise<string> => {
    if (blockHumanMs <= 0) return text
    const wasQueued = text.includes('[queued:')
    const needsPerson =
      wasQueued ||
      text.includes('[wait: human_required]') ||
      text.includes('[wait: human_took_over]')
    if (!needsPerson) return text
    const beforeAgentAt = session.agentAt
    let queueDrained = !wasQueued
    const deadline = Date.now() + blockHumanMs
    while (Date.now() < deadline && !closed) {
      if (session.phase === 'exited') break
      if (session.lease.holder === 'agent' && !session.lease.suspended) {
        if (!queueDrained) {
          // The shell is back with the agent, but the queued command may still
          // be in flight. Wait until it has been written before settling: an
          // idle prompt from the previous command would otherwise look done.
          if (session.pending.length === 0 && session.agentAt > beforeAgentAt) {
            queueDrained = true
          } else {
            await delay(100)
            continue
          }
        }
        const remaining = Math.max(1000, deadline - Date.now())
        const waited = await session.wait({ timeoutMs: Math.min(remaining, 5000) })
        if (waited.outcome !== 'timeout' && waited.outcome !== 'human_took_over') {
          return waitText(waited)
        }
      } else {
        await delay(200)
      }
    }
    const snapshot = session.snapshot()
    return `${snapshot.view.text.length > 0 ? snapshot.view.text : '(no visible output)'}\n[wait: human_required] [phase: ${snapshot.phase}]\n${snapshot.status}`
  }

  const callTool = async (name: string, args: Record<string, unknown>): Promise<McpToolResult> => {
    const tool = byName.get(name)
    if (tool === undefined) return textResult(`unknown tool: ${name}`, true)
    if (name === 'terminal_open') await ensurePanel()
    let result: McpToolResult
    try {
      result = await tool.execute(args)
    } catch (error) {
      return textResult(errorText(error), true)
    }
    if (name === 'terminal_open') {
      const text = result.content[0]?.text ?? ''
      if (panel !== undefined) result = textResult(`${text}\n[panel: ${panel.url}]`)
    }
    if (name === 'terminal_send') {
      const sessionId = typeof args['sessionId'] === 'string' ? args['sessionId'] : undefined
      const session = sessionId === undefined ? undefined : registry.get(sessionId)
      if (session !== undefined) {
        const text = result.content[0]?.text ?? ''
        result = textResult(await waitForPerson(session, text))
      }
    }
    return result
  }

  const handleRequest = async (message: RpcRequest): Promise<void> => {
    const id = message.id
    if (typeof id !== 'string' && typeof id !== 'number') return
    const method = message.method
    if (typeof method !== 'string') {
      fail(id, -32600, 'missing method')
      return
    }
    const params = typeof message.params === 'object' && message.params !== null ? (message.params as Record<string, unknown>) : {}
    switch (method) {
      case 'initialize': {
        const requested = params['protocolVersion']
        const protocolVersion = typeof requested === 'string' ? requested : DEFAULT_PROTOCOL
        respond(id, {
          protocolVersion,
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false, subscribe: false },
            extensions: {
              'io.modelcontextprotocol/ui': {
                mimeTypes: [UI_MIME],
              },
            },
          },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          instructions:
            'You can open and drive a real PTY terminal that the user shares. The terminal_* tools return screen snapshots and explicit wait outcomes. The user watches and types into the same shell in a browser panel or in the terminal panel beside the conversation; terminal_open returns the browser panel URL when one is available. When a result says human_required, ask the user to type in the panel; terminal_send waits briefly for that and returns the command result when it settles. The terminal runs outside the agent sandbox, so use it for interactive or long-running work, not to bypass approvals. Close sessions you no longer need.',
        })
        return
      }
      case 'ping':
        respond(id, {})
        return
      case 'tools/list':
        respond(id, {
          tools: tools.map((tool) => ({
            name: tool.name,
            ...(tool.title === undefined ? {} : { title: tool.title }),
            description: tool.description,
            inputSchema: tool.inputSchema,
            ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
            ...(tool.annotations === undefined ? {} : { annotations: tool.annotations }),
            ...(tool.meta === undefined ? {} : { _meta: tool.meta }),
          })),
        })
        return
      case 'resources/list':
        respond(id, {
          resources: [
            {
              uri: UI_URI,
              name: 'Interactive Terminal',
              description: 'A shared terminal panel for the conversation.',
              mimeType: UI_MIME,
            },
          ],
        })
        return
      case 'resources/templates/list':
        respond(id, { resourceTemplates: [] })
        return
      case 'resources/subscribe':
      case 'resources/unsubscribe':
      case 'logging/setLevel':
        respond(id, {})
        return
      case 'prompts/list':
        respond(id, { prompts: [] })
        return
      case 'resources/read': {
        const uri = typeof params['uri'] === 'string' ? params['uri'] : ''
        if (uri !== UI_URI) {
          fail(id, -32602, `unknown resource: ${uri}`)
          return
        }
        appHtml ??= await loadPanelAppHtml()
        try {
          appendFileSync('/tmp/ait-resource.log', `${new Date().toISOString()} read ${uri} bytes=${appHtml.length}\n`)
        } catch { /* diagnostics are best effort */ }
        respond(id, {
          contents: [
            {
              uri: UI_URI,
              mimeType: UI_MIME,
              text: appHtml,
              _meta: {
                ui: {
                  prefersBorder: true,
                },
              },
            },
          ],
        })
        return
      }
      case 'tools/call': {
        const call = params as ToolCallParams
        try {
          appendFileSync('/tmp/ait-resource.log', `${new Date().toISOString()} call ${call.name}\n`)
        } catch { /* diagnostics are best effort */ }
        const name = typeof call.name === 'string' ? call.name : ''
        if (name === '') {
          fail(id, -32602, 'tool name is required')
          return
        }
        const args =
          typeof call.arguments === 'object' && call.arguments !== null && !Array.isArray(call.arguments)
            ? (call.arguments as Record<string, unknown>)
            : {}
        const result = await callTool(name, args)
        respond(id, {
          content: result.content,
          ...(result.structuredContent === undefined ? {} : { structuredContent: result.structuredContent }),
          ...(result.meta === undefined ? {} : { _meta: result.meta }),
          ...(result.isError === true ? { isError: true } : {}),
        })
        return
      }
      case 'shutdown':
        respond(id, {})
        return
      default:
        fail(id, -32601, `unknown method: ${method}`)
    }
  }

  const handleLine = (line: string): void => {
    const trimmed = line.trim()
    if (trimmed.length === 0) return
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      writeStderr('ignored a non-JSON line')
      return
    }
    if (typeof parsed !== 'object' || parsed === null) return
    const message = parsed as RpcRequest
    const method = message.method
    if (typeof method !== 'string') return
    const hasId = typeof message.id === 'string' || typeof message.id === 'number'
    if (!hasId) {
      if (method === 'exit') void shutdown(0)
      return
    }
    void handleRequest(message).catch((error: unknown) => {
      if (typeof message.id === 'string' || typeof message.id === 'number') {
        fail(message.id, -32603, errorText(error))
      }
    })
  }

  let shuttingDown = false
  const shutdown = async (code: number): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    closed = true
    disposeUiTaps()
    try {
      await panel?.close()
    } catch {
      // The panel may already be gone.
    }
    try {
      await registry.closeAll()
    } catch {
      // Best effort; the process is about to exit.
    }
    process.exit(code)
  }

  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity })
  reader.on('line', handleLine)
  reader.on('close', () => {
    if (!shuttingDown) void shutdown(0)
  })
  process.once('SIGINT', () => void shutdown(0))
  process.once('SIGTERM', () => void shutdown(0))
  process.stdin.resume()
}
