#!/usr/bin/env node
// Codex spawns this wrapper as the MCP server. It resolves the repository's
// built entry point from its own location, so the plugin keeps working when the
// checkout moves as long as the wrapper path in .mcp.json is updated.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, '..', '..', '..', 'dist', 'mcp', 'cli.js')

if (!existsSync(cli)) {
  process.stderr.write(`agent-interactive-terminal: ${cli} is missing; run "npm run build" first\n`)
  process.exit(1)
}

const child = spawn(process.execPath, [cli], { stdio: 'inherit', env: process.env })
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
  } else {
    process.exit(code ?? 0)
  }
})
child.on('error', (error) => {
  process.stderr.write(`agent-interactive-terminal: failed to start ${cli}: ${error.message}\n`)
  process.exit(1)
})
