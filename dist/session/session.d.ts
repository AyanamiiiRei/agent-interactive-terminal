import type { AuditEntry, NamedKey, OpenOptions, SessionPhase, TerminalView, AgentAccess, WaitResult, WaitSpec, WriteOrigin } from '../types.js';
/** How a session starts. The id is minted by the registry. */
export interface SessionInit extends OpenOptions {
    id: string;
}
export interface LeaseState {
    holder: 'agent' | 'human' | 'none';
    since: number;
    reason: 'open' | 'takeover' | 'handback' | 'secret-prompt' | 'idle-release';
    suspended: boolean;
}
export interface SnapshotResult {
    phase: SessionPhase;
    revision: number;
    view: TerminalView;
    status: string;
    alt: boolean;
    cols: number;
    rows: number;
    cursor: {
        row: number;
        col: number;
    };
    /** Present only for screen views. */
    lines?: readonly string[];
    changedRows?: readonly number[];
}
export declare class TerminalSession {
    readonly id: string;
    readonly name: string | undefined;
    readonly kind: 'agent' | 'user';
    private readonly shell;
    private readonly shellName;
    private readonly launch;
    private pty;
    private readonly screen;
    private readonly extraEnv;
    private readonly listeners;
    private readonly outputListeners;
    private phaseValue;
    private leaseState;
    private cwdValue;
    private fg;
    private promptReady;
    private sawPrompt;
    private sawOutput;
    private awaitingCommand;
    private childSeen;
    private bracketedPaste;
    private secretMuted;
    private rawTail;
    private lastOutputAt;
    private lastWriteAt;
    private agentCommandValue;
    private agentCommandAtValue;
    private peekAtValue;
    private agentAccessValue;
    private lastExitCode;
    private lastExitSignal;
    private pollTimer;
    private notifyScheduled;
    private closed;
    private exitResolve;
    private readonly exitPromise;
    private readonly auditLog;
    private lastViewLines;
    private lastViewRevision;
    private readonly readyResolvers;
    private constructor();
    static open(init: SessionInit): Promise<TerminalSession>;
    get phase(): SessionPhase;
    get lease(): LeaseState;
    /**
     * Hand the keyboard to a person. Agent writes fail with LEASE_DENIED and an
     * agent wait settles with `human_took_over` until `handBack`.
     */
    takeOver(): void;
    /** Return the keyboard to the agent. Only a person should call this. */
    handBack(): void;
    /**
     * Suspend the agent because the next input is a secret only a person may
     * provide. Password detection calls this automatically; a host can call it
     * when it knows a prompt needs a human.
     */
    requireHuman(): void;
    get pid(): number;
    get cwd(): string;
    get revision(): number;
    /** Exit status of the shell, when it has exited. */
    get exitCode(): number | null;
    /** The signal that ended the shell, when it was signalled. */
    get exitSignal(): number | null;
    /** Whether a client asked for the close rather than the shell exiting. */
    get closedByOwner(): boolean;
    /** The last command the agent submitted, for display in the panel chrome. */
    get agentCommand(): string | undefined;
    /** When that command was submitted, in epoch milliseconds. */
    get agentCommandAt(): number;
    /** How much of this session the agent may use. Only a person should set it. */
    get agentAccess(): AgentAccess;
    /** Change the agent's access; sealed aborts reads and writes at once. */
    setAgentAccess(next: AgentAccess): void;
    /** When the agent last looked at this session, in epoch milliseconds. */
    get peekAt(): number;
    /** Mark that the agent read the session, so the panel can show it looking. */
    markPeek(): void;
    get size(): {
        cols: number;
        rows: number;
    };
    private start;
    /** Write text, optionally submitting Enter, and return immediately. */
    write(text: string, options?: {
        submit?: boolean;
        paste?: boolean;
        origin?: WriteOrigin;
    }): Promise<void>;
    /** Deliver one named key, using a real signal where a person would send one. */
    press(key: NamedKey, repeat?: number): Promise<void>;
    /** Wait for one of several conditions. The first satisfied one settles. */
    wait(spec?: WaitSpec, signal?: AbortSignal): Promise<WaitResult>;
    /** Read the current screen without writing anything. */
    snapshot(options?: {
        sinceRevision?: number;
        maxRows?: number;
        mode?: 'auto' | 'screen' | 'output';
    }): SnapshotResult;
    resize(cols: number, rows: number): void;
    /** Recorded writes and control changes, oldest first. */
    audit(): readonly AuditEntry[];
    /** One line for a per-turn context capsule. */
    capsuleLine(): string;
    private recordAudit;
    /** One stable status line, safe to show to a model. */
    statusLine(): string;
    /** Styled screen for a browser terminal attaching to this session. */
    serialize(): string;
    subscribe(listener: () => void): () => void;
    /**
     * Raw terminal output, for an attach stream that renders ANSI itself.
     * Agent-facing projections never use this.
     */
    onOutput(listener: (data: string) => void): () => void;
    close(): Promise<void>;
    private onMarker;
    private poll;
    private markPromptReady;
    private refreshPhase;
    private buildWaitResult;
    private buildView;
    private notify;
    private static readonly SECRET_PROMPT;
    /**
     * A credential prompt at the end of the visible screen suspends the agent.
     * Detection is deliberately narrow: the match must be on the last non-empty
     * row of a session that is currently running a command, so a line printed
     * and followed by a prompt does not trigger it.
     */
    private detectSecretPrompt;
    private assertAgentMayWrite;
    private assertAgentMayRead;
    private assertUsable;
}
//# sourceMappingURL=session.d.ts.map