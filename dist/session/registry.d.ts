import type { OpenOptions } from '../types.js';
import { TerminalSession } from './session.js';
export interface RegistryOptions {
    /** Upper bound on concurrently open sessions. */
    maxSessions?: number;
}
export declare class TerminalRegistry {
    private readonly sessions;
    private readonly maxSessions;
    constructor(options?: RegistryOptions);
    /** Open a session and publish it under a fresh id. */
    open(options?: OpenOptions): Promise<TerminalSession>;
    get(id: string): TerminalSession | undefined;
    /** Resolve a session id or throw a routable error. */
    require(id: string): TerminalSession;
    list(): TerminalSession[];
    /**
     * Two or three lines describing every open session, plus a version that
     * changes only when the summary changes. Callers can inject the text into a
     * system prompt when the version differs from the last one they sent.
     */
    capsule(): {
        text: string;
        version: string;
    };
    close(id: string): Promise<boolean>;
    closeAll(): Promise<void>;
    private findByName;
}
//# sourceMappingURL=registry.d.ts.map