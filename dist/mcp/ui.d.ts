import type { TerminalRegistry } from '../session/registry.js';
import type { McpTool } from './tool.js';
/** Resource URI of the terminal panel app. */
export declare const UI_URI = "ui://terminal/panel-v13.html";
/** MIME type the host expects for an MCP App template. */
export declare const UI_MIME = "text/html;profile=mcp-app";
/**
 * Build the app-only tools and the panel entry tool.
 *
 * @param registry - the same registry the agent-facing tools use.
 */
export declare function createUiTools(registry: TerminalRegistry): McpTool[];
/** Stop every output tap, for MCP server shutdown. */
export declare function disposeUiTaps(): void;
//# sourceMappingURL=ui.d.ts.map