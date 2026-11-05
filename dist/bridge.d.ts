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
 * The routes live under `/agent-terminal-bridge` on the Host web
 * server. They accept only loopback requests with the same-origin check the
 * other in-page plugins use, because the payload can type into a live shell.
 *
 * @module agent-interactive-terminal/bridge
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TerminalRegistry } from './session/registry.js';
import type { TerminalSession } from './session/session.js';
/** One DSH session's live terminal registry, resolved from the request. */
export interface BridgeTarget {
    registry: TerminalRegistry;
    /** Open a session for the person, honouring the plugin's shell choice. */
    open(options: {
        cols?: number;
        rows?: number;
        kind?: 'agent' | 'user';
    }): Promise<TerminalSession>;
}
/** What the bridge needs from the plugin. */
export interface BridgeDeps {
    /**
     * Resolve the live Agent that owns one DSH session id.
     * @param sessionId - DSH session identity supplied by the page.
     * @returns the registry face, or undefined when the session is not live.
     */
    resolve(sessionId: string): BridgeTarget | undefined;
}
/**
 * Reject requests that did not come from the local page.
 *
 * @param req - incoming request.
 * @returns whether the request is a loopback, same-origin request.
 */
export declare function isLocalRequest(req: IncomingMessage): boolean;
/**
 * Build the bridge request handler.
 *
 * The returned handler owns the full response lifecycle for one prefix route;
 * the plugin registers it on the Host web server.
 *
 * @param deps - session resolution.
 * @returns an HTTP handler for every `/agent-terminal-bridge` path.
 */
export declare function createBridgeHandler(deps: BridgeDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
//# sourceMappingURL=bridge.d.ts.map