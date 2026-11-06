import { TerminalRegistry } from '../session/registry.js';
/** Options for {@link runMcpServer}. */
export interface McpServerOptions {
    registry?: TerminalRegistry;
    /** Set false to run without a browser panel. */
    panel?: boolean;
    panelPort?: number;
    panelToken?: string;
    /** How long `terminal_send` waits for a person to finish at the keyboard. */
    blockHumanMs?: number;
}
/**
 * Run the MCP server until stdin closes or the client asks it to exit.
 *
 * @param options - registry and panel overrides, mainly for tests.
 */
export declare function runMcpServer(options?: McpServerOptions): Promise<void>;
//# sourceMappingURL=server.d.ts.map