/**
 * Minimal declarations for the vendored MCP Apps browser SDK.
 *
 * Only the surface the terminal panel uses is declared; the implementation is
 * the official `@modelcontextprotocol/ext-apps` browser bundle.
 */
export declare class App {
  constructor(options: { name: string; version: string })
  connect(): Promise<void>
  callServerTool(params: {
    name: string
    arguments?: Record<string, unknown>
  }): Promise<{
    content?: Array<{ type: string; text?: string }>
    structuredContent?: unknown
    isError?: boolean
  }>
}
