import type { TerminalRegistry } from '../session/registry.js';
/** What a standalone panel needs to serve. */
export interface PanelServerOptions {
    registry: TerminalRegistry;
    /** Port to listen on. Zero asks the operating system for a free port. */
    port?: number;
    /** Interface to bind. Defaults to loopback. */
    host?: string;
    /** Fixed token, mainly for tests. Defaults to 32 random bytes. */
    token?: string;
}
/** A running panel server and the URL a person can open. */
export interface PanelServer {
    /** Full URL including the access token. */
    url: string;
    token: string;
    port: number;
    close(): Promise<void>;
}
/**
 * Start a panel server on loopback.
 *
 * @param options - registry to expose and optional bind details.
 * @returns the running server, its token, and its URL.
 */
export declare function createPanelServer(options: PanelServerOptions): Promise<PanelServer>;
//# sourceMappingURL=server.d.ts.map