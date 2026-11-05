/**
 * WebSocket attach stream for the browser terminal.
 *
 * The right-sidebar panel is a real terminal emulator, not a log viewer: it
 * writes raw keystrokes into the same PTY the agent drives, and renders the
 * byte stream with xterm.js. The initial paint is an ANSI snapshot of the
 * session's screen model, taken from the same `@xterm/headless` screen the
 * agent's projections use, so the page and the model never disagree about
 * what is on screen.
 *
 * One socket carries one session. Control messages are JSON text frames;
 * terminal output is binary frames, because it is not JSON and must not be
 * escaped. The Host web server owns the upgrade route, so the page connects
 * to the same origin it was served from and no second port is exposed.
 *
 * @module agent-interactive-terminal/attach
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { BridgeDeps } from './bridge.js';
/** One attach route: the upgrade handler plus a disposer for unload. */
export interface AttachUpgrade {
    handler(req: IncomingMessage, socket: Duplex, head: Buffer): void;
    dispose(): void;
}
/**
 * Build the attach upgrade handler for one Host.
 *
 * @param deps - the same session resolver the HTTP bridge uses.
 * @returns the upgrade handler and a disposer that closes every socket.
 */
export declare function createAttachUpgrade(deps: BridgeDeps): AttachUpgrade;
//# sourceMappingURL=attach.d.ts.map