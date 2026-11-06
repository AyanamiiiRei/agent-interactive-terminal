/**
 * Shared shape for a tool exposed over MCP.
 *
 * The eight agent-facing tools and the app-only tools used by the conversation
 * panel both fit this shape; only the metadata and result payloads differ.
 *
 * @module agent-interactive-terminal/mcp/tool
 */
import type { JsonSchema } from '../tools/index.js'

/** One content block in a tool result. */
export interface McpTextContent {
  type: 'text'
  text: string
}

/** What one MCP tool call returns. */
export interface McpToolResult {
  content: McpTextContent[]
  structuredContent?: unknown
  /** Result-level metadata, such as the MCP App resource URI. */
  meta?: Record<string, unknown>
  isError?: boolean
}

/** One tool advertised by `tools/list`. */
export interface McpTool {
  name: string
  title?: string
  description: string
  inputSchema: JsonSchema
  outputSchema?: Record<string, unknown>
  annotations?: Record<string, unknown>
  meta?: Record<string, unknown>
  execute(input: Record<string, unknown>): Promise<McpToolResult>
}
