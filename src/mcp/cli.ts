#!/usr/bin/env node
/**
 * MCP stdio entry point.
 *
 * @module agent-interactive-terminal/mcp/cli
 */
import { runMcpServer } from './server.js'

runMcpServer().catch((error: unknown) => {
  process.stderr.write(`[ait-mcp] fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exit(1)
})
