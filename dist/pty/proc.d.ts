export interface ForegroundInfo {
    /** Foreground process group of the terminal. */
    pgid: number;
    /** True when a member of that group is blocked in a terminal read. */
    inputWaiting: boolean;
    /** Command name of the group leader, when readable. */
    command?: string | undefined;
}
/**
 * Inspect the foreground process group of the terminal owned by `shellPid`.
 *
 * Returns undefined when `/proc` is unavailable or the process is gone, which
 * makes the caller fall back to prompt markers and output silence.
 */
export declare function inspectForeground(shellPid: number, platform?: NodeJS.Platform): ForegroundInfo | undefined;
/** Deliver a signal to a process group, which is how a terminal job is stopped. */
export declare function signalGroup(pgid: number, signal: NodeJS.Signals): void;
//# sourceMappingURL=proc.d.ts.map