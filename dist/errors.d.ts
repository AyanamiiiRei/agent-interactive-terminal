/**
 * Machine-routable session failures.
 * @module agent-interactive-terminal/errors
 */
export type SessionErrorCode = 'NO_SESSION' | 'LEASE_DENIED' | 'READ_ONLY' | 'SEALED' | 'QUEUE_FULL' | 'CLOSED' | 'SPAWN_FAILED';
export declare class SessionError extends Error {
    readonly code: SessionErrorCode;
    constructor(message: string, code: SessionErrorCode);
}
//# sourceMappingURL=errors.d.ts.map