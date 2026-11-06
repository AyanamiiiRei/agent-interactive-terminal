#!/usr/bin/env node
/**
 * Standalone panel process.
 *
 * Useful for trying the browser panel without an agent, and for agents whose
 * MCP server is managed elsewhere: run `ait-panel`, open the printed URL, and
 * the panel exposes the same sessions through the same registry.
 *
 * @module agent-interactive-terminal/panel/cli
 */
import { spawn } from 'node:child_process'
import { TerminalRegistry } from '../session/registry.js'
import { createPanelServer } from './server.js'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function openBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.unref()
  } catch {
    // Headless environments simply keep the URL on stderr.
  }
}

const maxSessions = Number(arg('--max-sessions') ?? process.env['AIT_MAX_SESSIONS'] ?? 4)
const registry = new TerminalRegistry({ maxSessions: Number.isFinite(maxSessions) ? maxSessions : 4 })
const panel = await createPanelServer({
  registry,
  ...(arg('--port') === undefined ? {} : { port: Number(arg('--port')) }),
  ...(arg('--token') === undefined ? {} : { token: String(arg('--token')) }),
})

process.stderr.write(`agent-interactive-terminal panel: ${panel.url}\n`)
if (process.argv.includes('--open') || process.env['AIT_OPEN_BROWSER'] === '1') openBrowser(panel.url)

async function shutdown(): Promise<void> {
  await panel.close()
  await registry.closeAll()
  process.exit(0)
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
