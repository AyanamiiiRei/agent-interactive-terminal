/**
 * One persistent terminal session: PTY, screen model, phase detection, and
 * wait conditions.
 *
 * @module agent-interactive-terminal/session
 */
import { SessionError } from '../errors.js';
import { PtyProcess } from '../pty/pty.js';
import { inspectForeground, signalGroup } from '../pty/proc.js';
import { ScreenModel } from '../screen/model.js';
import { buildShellLaunch } from './shell.js';
const DEFAULT_SETTLE = ['idle', 'waiting_input'];
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_SCREEN_ROWS = 60;
const MAX_OUTPUT_ROWS = 200;
/** Key bytes for keys that are plain input rather than signals. */
const KEY_BYTES = {
    enter: '\r',
    tab: '\t',
    escape: '\x1b',
    backspace: '\x7f',
    delete: '\x1b[3~',
    up: '\x1b[A',
    down: '\x1b[B',
    right: '\x1b[C',
    left: '\x1b[D',
    home: '\x1b[H',
    end: '\x1b[F',
    'page-up': '\x1b[5~',
    'page-down': '\x1b[6~',
    'ctrl-a': '\x01',
    'ctrl-b': '\x02',
    'ctrl-d': '\x04',
    'ctrl-e': '\x05',
    'ctrl-k': '\x0b',
    'ctrl-l': '\x0c',
    'ctrl-r': '\x12',
    'ctrl-u': '\x15',
    'ctrl-w': '\x17',
};
/** Keys that a person expresses as Ctrl but the kernel delivers as signals. */
const KEY_SIGNALS = {
    'ctrl-c': 'SIGINT',
    'ctrl-z': 'SIGTSTP',
};
/** Cap the queue so a confused agent cannot pile up an unbounded backlog. */
const MAX_PENDING = 8;
export class TerminalSession {
    id;
    name;
    kind;
    shell;
    shellName;
    launch;
    pty;
    screen;
    extraEnv;
    listeners = new Set();
    outputListeners = new Set();
    phaseValue = 'starting';
    leaseState;
    cwdValue;
    fg;
    promptReady = false;
    sawPrompt = false;
    sawOutput = false;
    awaitingCommand = false;
    childSeen = false;
    bracketedPaste = false;
    secretMuted = false;
    rawTail = '';
    lastOutputAt = Date.now();
    lastWriteAt = 0;
    agentCommandValue;
    agentCommandAtValue = 0;
    lastAgentWriteAtValue = 0;
    peekAtValue = 0;
    agentAccessValue = 'collaborate';
    pendingCommands = [];
    pendingSeq = 0;
    draining = false;
    canceledPendingValue = null;
    lastExitCode = null;
    lastExitSignal = null;
    pollTimer;
    notifyScheduled = false;
    closed = false;
    exitResolve;
    exitPromise;
    auditLog = [];
    lastViewLines = [];
    lastViewRevision = -1;
    readyResolvers = [];
    constructor(init) {
        this.id = init.id;
        this.name = init.name;
        this.kind = init.kind ?? 'agent';
        this.launch = buildShellLaunch(init.shell);
        this.shell = this.launch.file;
        this.shellName = this.launch.label ?? this.shell.split(/[\\/]/).pop() ?? this.shell;
        this.cwdValue = init.cwd ?? process.cwd();
        this.extraEnv = init.env ?? {};
        this.leaseState = { holder: 'agent', since: Date.now(), reason: 'open', suspended: false };
        this.screen = new ScreenModel({
            cols: init.cols ?? 100,
            rows: init.rows ?? 30,
            scrollback: 2000,
        });
        this.exitPromise = new Promise((resolve) => {
            this.exitResolve = resolve;
        });
    }
    static async open(init) {
        let resolved = init;
        if (init.secrets !== undefined) {
            const { secrets, ...rest } = init;
            const env = { ...(init.env ?? {}) };
            for (const [key, provide] of Object.entries(secrets)) {
                env[key] = await provide();
            }
            resolved = { ...rest, env };
        }
        const session = new TerminalSession(resolved);
        await session.start();
        return session;
    }
    get phase() {
        return this.phaseValue;
    }
    get lease() {
        return { ...this.leaseState };
    }
    /**
     * Hand the keyboard to a person. Agent writes are queued (not refused) and an
     * agent wait settles with `human_took_over` until `handBack`.
     */
    takeOver() {
        this.assertUsable();
        this.leaseState = { holder: 'human', since: Date.now(), reason: 'takeover', suspended: false };
        this.recordAudit({ at: Date.now(), kind: 'lease', origin: 'human', bytes: 0, preview: '', detail: 'takeover' });
        this.notify();
    }
    /** Return the keyboard to the agent and drain anything the agent queued. */
    handBack() {
        this.assertUsable();
        this.leaseState = { holder: 'agent', since: Date.now(), reason: 'handback', suspended: false };
        this.recordAudit({ at: Date.now(), kind: 'lease', origin: 'human', bytes: 0, preview: '', detail: 'handback' });
        void this.drainPending();
        this.notify();
    }
    /** Agent commands waiting for the person to release the keyboard. */
    get pending() {
        return this.pendingCommands.map((item) => ({
            id: item.id,
            command: previewOf(item.text),
            at: item.at,
        }));
    }
    /** The most recently canceled queued command, if any. */
    get canceledPending() {
        return this.canceledPendingValue === null ? null : { ...this.canceledPendingValue };
    }
    /**
     * Remove one queued command, or the whole queue when `id` is omitted. Only a
     * person should call this; the agent cannot cancel its own queue.
     */
    cancelPending(id) {
        if (this.pendingCommands.length === 0)
            return 0;
        if (id === undefined) {
            const removed = this.pendingCommands.splice(0);
            this.rememberCanceled(removed[0]);
            this.notify();
            return removed.length;
        }
        const index = this.pendingCommands.findIndex((item) => item.id === id);
        if (index < 0)
            return 0;
        const [removed] = this.pendingCommands.splice(index, 1);
        this.rememberCanceled(removed);
        this.notify();
        return 1;
    }
    /**
     * Suspend the agent because the next input is a secret only a person may
     * provide. Password detection calls this automatically; a host can call it
     * when it knows a prompt needs a human.
     */
    requireHuman() {
        this.assertUsable();
        this.leaseState = { holder: 'human', since: Date.now(), reason: 'secret-prompt', suspended: true };
        this.recordAudit({
            at: Date.now(),
            kind: 'lease',
            origin: 'system',
            bytes: 0,
            preview: '',
            detail: 'secret prompt: control suspended',
        });
        this.notify();
    }
    get pid() {
        return this.pty.pid;
    }
    get cwd() {
        return this.cwdValue;
    }
    get revision() {
        return this.screen.revisionNumber;
    }
    /** Exit status of the shell, when it has exited. */
    get exitCode() {
        return this.lastExitCode;
    }
    /** The signal that ended the shell, when it was signalled. */
    get exitSignal() {
        return this.lastExitSignal;
    }
    /** Whether a client asked for the close rather than the shell exiting. */
    get closedByOwner() {
        return this.closed;
    }
    /** The last command the agent submitted, for display in the panel chrome. */
    get agentCommand() {
        return this.agentCommandValue;
    }
    /** When that command was submitted, in epoch milliseconds. */
    get agentCommandAt() {
        return this.agentCommandAtValue;
    }
    /** When the agent last wrote anything, including a partial line. */
    get agentAt() {
        return this.lastAgentWriteAtValue;
    }
    /** How much of this session the agent may use. Only a person should set it. */
    get agentAccess() {
        return this.agentAccessValue;
    }
    /** Change the agent's access; sealed aborts reads and writes at once. */
    setAgentAccess(next) {
        this.assertUsable();
        if (next !== 'collaborate' && next !== 'observe' && next !== 'sealed') {
            throw new Error(`unknown access level: ${String(next)}`);
        }
        if (next === this.agentAccessValue)
            return;
        this.agentAccessValue = next;
        if (next !== 'collaborate' && this.pendingCommands.length > 0) {
            const removed = this.pendingCommands.splice(0);
            this.rememberCanceled(removed[0]);
        }
        this.recordAudit({
            at: Date.now(),
            kind: 'access',
            origin: 'human',
            bytes: 0,
            preview: '',
            detail: next,
        });
        this.notify();
    }
    /** When the agent last looked at this session, in epoch milliseconds. */
    get peekAt() {
        return this.peekAtValue;
    }
    /** Mark that the agent read the session, so the panel can show it looking. */
    markPeek() {
        this.peekAtValue = Date.now();
        this.notify();
    }
    get size() {
        return { cols: this.screen.cols, rows: this.screen.rows };
    }
    async start() {
        try {
            this.pty = new PtyProcess({
                file: this.launch.file,
                args: this.launch.args,
                cwd: this.cwdValue,
                env: {
                    ...process.env,
                    TERM: 'xterm-256color',
                    COLORTERM: 'truecolor',
                    ...this.launch.env,
                    ...this.extraEnv,
                },
                cols: this.screen.cols,
                rows: this.screen.rows,
            });
        }
        catch (error) {
            this.launch.cleanup();
            throw new SessionError(`failed to spawn ${this.shell}: ${error.message}`, 'SPAWN_FAILED');
        }
        this.pty.onData((data) => {
            this.rawTail = (this.rawTail + data).slice(-64);
            const paste = /\x1b\[\?2004([hl])/g;
            let match;
            while ((match = paste.exec(this.rawTail)) !== null) {
                this.bracketedPaste = match[1] === 'h';
            }
            this.lastOutputAt = Date.now();
            this.sawOutput = true;
            // A bare newline is the echo of the submitted secret itself; only real
            // output may re-arm credential-prompt detection.
            if (/[^\x00-\x1f\x7f]/.test(data))
                this.secretMuted = false;
            for (const listener of this.outputListeners)
                listener(data);
            void this.screen.write(data).then(() => {
                this.detectSecretPrompt();
                this.notify();
            });
        });
        this.pty.onExit(({ exitCode, signal }) => {
            this.lastExitCode = exitCode;
            this.lastExitSignal = typeof signal === 'number' ? signal : null;
            this.phaseValue = 'exited';
            if (this.pollTimer)
                clearInterval(this.pollTimer);
            this.notify();
            this.exitResolve?.();
        });
        this.screen.onData((data) => this.pty.write(data));
        this.screen.onOsc(9999, (data) => this.onMarker(data));
        this.screen.onOsc(7, (data) => {
            const match = /^file:\/\/[^/]*(\/.*)$/.exec(data);
            if (match?.[1])
                this.cwdValue = decodeURIComponent(match[1]);
        });
        const ready = new Promise((resolve) => {
            this.readyResolvers.push(resolve);
        });
        this.pollTimer = setInterval(() => this.poll(), 120);
        this.poll();
        await Promise.race([ready, delay(3000)]);
        if (this.phaseValue === 'exited') {
            this.launch.cleanup();
            throw new SessionError('shell exited during startup', 'SPAWN_FAILED');
        }
    }
    /** Write text, optionally submitting Enter. A person's turn queues the agent. */
    async write(text, options = {}) {
        this.assertUsable();
        const origin = options.origin ?? 'agent';
        if (origin === 'agent') {
            this.assertAgentMayWrite();
            if (this.leaseState.suspended) {
                throw new SessionError('control is held by the user', 'LEASE_DENIED');
            }
            if (this.leaseState.holder !== 'agent') {
                const pending = this.enqueue(text, options);
                return { queued: true, pendingId: pending.id, pendingCount: this.pendingCommands.length };
            }
        }
        this.writeNow(text, options);
        return { queued: false };
    }
    /** Put an agent write behind the person's current keyboard turn. */
    enqueue(text, options) {
        if (this.pendingCommands.length >= MAX_PENDING) {
            throw new SessionError('too many agent commands are already queued', 'QUEUE_FULL');
        }
        const pending = {
            id: ++this.pendingSeq,
            text,
            submit: options.submit ?? true,
            ...(options.paste === undefined ? {} : { paste: options.paste }),
            at: Date.now(),
        };
        this.pendingCommands.push(pending);
        this.canceledPendingValue = null;
        this.notify();
        return pending;
    }
    writeNow(text, options = {}) {
        const origin = options.origin ?? 'agent';
        const submit = options.submit ?? true;
        let payload = text;
        const usePaste = options.paste ?? (text.includes('\n') && this.bracketedPaste);
        if (usePaste)
            payload = `\x1b[200~${text}\x1b[201~`;
        if (submit) {
            payload += '\r';
            this.awaitingCommand = true;
            this.promptReady = false;
        }
        const secret = origin === 'human' && this.leaseState.suspended;
        const submitting = submit || /[\r\n]/.test(text);
        const command = origin === 'agent' && submitting ? text.replace(/[\r\n]+/g, ' ').trim() : '';
        if (origin === 'agent')
            this.lastAgentWriteAtValue = Date.now();
        if (command !== '') {
            this.agentCommandValue = command;
            this.agentCommandAtValue = Date.now();
        }
        this.recordAudit({
            at: Date.now(),
            kind: 'write',
            origin,
            bytes: Buffer.byteLength(payload, 'utf8'),
            preview: secret ? '' : previewOf(text),
            ...(secret ? { detail: 'redacted: human input while suspended' } : {}),
        });
        this.pty.write(payload);
        this.lastOutputAt = Date.now();
        this.lastWriteAt = Date.now();
        if (origin === 'human' && submitting && this.leaseState.suspended) {
            // The person has supplied the secret; the agent may drive again, and the
            // prompt still on screen must not re-suspend until new output arrives.
            this.leaseState = { holder: 'agent', since: Date.now(), reason: 'handback', suspended: false };
            this.secretMuted = true;
        }
        this.refreshPhase();
    }
    rememberCanceled(item) {
        if (item === undefined)
            return;
        this.canceledPendingValue = {
            id: item.id,
            command: previewOf(item.text),
            at: Date.now(),
        };
    }
    /** Send commands the agent queued while a person held the keyboard. */
    async drainPending() {
        if (this.draining)
            return;
        this.draining = true;
        try {
            while (this.pendingCommands.length > 0 &&
                this.leaseState.holder === 'agent' &&
                !this.leaseState.suspended &&
                this.agentAccessValue === 'collaborate' &&
                !this.closed &&
                this.phaseValue !== 'exited') {
                const pending = this.pendingCommands.shift();
                if (pending === undefined)
                    break;
                this.writeNow(pending.text, {
                    submit: pending.submit,
                    ...(pending.paste === undefined ? {} : { paste: pending.paste }),
                    origin: 'agent',
                });
                this.notify();
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }
        finally {
            this.draining = false;
            this.notify();
        }
    }
    /** Deliver one named key, using a real signal where a person would send one. */
    async press(key, repeat = 1) {
        this.assertUsable();
        this.assertAgentMayWrite();
        if (this.leaseState.holder !== 'agent' || this.leaseState.suspended) {
            throw new SessionError('control is held by the user', 'LEASE_DENIED');
        }
        if (!Number.isInteger(repeat) || repeat < 1 || repeat > 50) {
            throw new Error('repeat must be an integer between 1 and 50');
        }
        this.lastAgentWriteAtValue = Date.now();
        const signal = KEY_SIGNALS[key];
        if (signal) {
            if (process.platform === 'win32') {
                // Windows has no POSIX process groups. Sending the control character
                // is what a person's keyboard does to a ConPTY session.
                this.pty.write(signal === 'SIGINT' ? '\x03' : '\x1a');
            }
            else {
                const target = this.fg?.pgid ?? this.pty.pid;
                try {
                    signalGroup(target, signal);
                }
                catch {
                    // macOS can lack a readable process group; killing the PTY child
                    // still interrupts the foreground shell.
                    this.pty.kill(signal);
                }
            }
            this.lastOutputAt = Date.now();
            return;
        }
        const bytes = KEY_BYTES[key];
        if (!bytes)
            throw new Error(`unknown key: ${key}`);
        this.pty.write(bytes.repeat(repeat));
        this.lastOutputAt = Date.now();
    }
    /** Wait for one of several conditions. The first satisfied one settles. */
    async wait(spec = {}, signal) {
        this.assertUsable();
        this.assertAgentMayRead();
        const timeoutMs = clamp(spec.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1, MAX_TIMEOUT_MS);
        const settleOn = spec.settleOn ?? DEFAULT_SETTLE;
        const started = Date.now();
        const deadline = started + timeoutMs;
        const evaluate = () => {
            if (this.phaseValue === 'exited')
                return 'exited';
            // The screen may have been parsed before the async write callback ran, so
            // look for a credential prompt here as well as in the data handler.
            this.detectSecretPrompt();
            if (this.leaseState.suspended)
                return 'human_required';
            if (this.leaseState.holder === 'human')
                return 'human_took_over';
            if (spec.match && spec.match.length > 0) {
                const text = this.screen.lines().join('\n');
                if (spec.match.some((pattern) => text.includes(pattern)))
                    return 'matched';
            }
            if (!this.awaitingCommand && settleOn.includes(this.phaseValue)) {
                // An idle prompt is a hard signal, but a prompt marker emitted for the
                // previous command can arrive just after a new write. Give fresh writes
                // a short window so the echo of the new command lands first. A program
                // that reads stdin needs a quiet window for the same reason.
                const quietFor = Date.now() - this.lastOutputAt;
                const sinceWrite = Date.now() - this.lastWriteAt;
                if (this.phaseValue === 'idle' ? sinceWrite >= 120 : quietFor >= 120) {
                    return 'settled';
                }
            }
            if (spec.quietMs !== undefined && Date.now() - this.lastOutputAt >= spec.quietMs) {
                return 'quiet';
            }
            if (Date.now() >= deadline)
                return 'timeout';
            return undefined;
        };
        return await new Promise((resolve, reject) => {
            let settled = false;
            const cleanup = () => {
                unsubscribe();
                clearInterval(timer);
                signal?.removeEventListener('abort', onAbort);
            };
            const finish = (outcome) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                resolve(this.buildWaitResult(outcome, started));
            };
            const check = () => {
                if (this.agentAccessValue === 'sealed') {
                    if (settled)
                        return;
                    settled = true;
                    cleanup();
                    reject(new SessionError('the user has sealed this terminal from the agent', 'SEALED'));
                    return;
                }
                const outcome = evaluate();
                if (outcome)
                    finish(outcome);
            };
            const onAbort = () => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                const error = new Error('wait aborted');
                error.name = 'AbortError';
                reject(error);
            };
            const unsubscribe = this.subscribe(check);
            const timer = setInterval(check, 50);
            signal?.addEventListener('abort', onAbort, { once: true });
            check();
        });
    }
    /** Read the current screen without writing anything. */
    snapshot(options = {}) {
        this.assertUsable();
        this.assertAgentMayRead();
        const view = this.buildView(options.mode ?? 'auto', options);
        const cursor = this.screen.cursor();
        const result = {
            phase: this.phaseValue,
            revision: this.revision,
            view,
            status: this.statusLine(),
            alt: this.screen.alt,
            cols: this.screen.cols,
            rows: this.screen.rows,
            cursor,
        };
        if (view.mode === 'screen') {
            result.lines = this.lastViewLines;
            if (view.changedRows)
                result.changedRows = view.changedRows;
        }
        return result;
    }
    resize(cols, rows) {
        this.assertUsable();
        if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2) {
            throw new Error('cols and rows must be integers of at least 2');
        }
        this.screen.resize(cols, rows);
        this.pty.resize(cols, rows);
        // A reflow invalidates row indices, so the next snapshot must be full.
        this.lastViewRevision = -1;
        this.notify();
    }
    /** Recorded writes and control changes, oldest first. */
    audit() {
        return this.auditLog.map((entry) => ({ ...entry }));
    }
    /** One line for a per-turn context capsule. */
    capsuleLine() {
        const name = this.name === undefined ? '' : ` "${this.name}"`;
        const alt = this.screen.alt ? ' alt' : '';
        return `${this.id}${name} ${this.shellName} ${this.phaseValue} ${this.screen.cols}x${this.screen.rows}${alt} ${this.cwdValue}`;
    }
    recordAudit(entry) {
        this.auditLog.push(entry);
        if (this.auditLog.length > 200)
            this.auditLog.shift();
    }
    /** One stable status line, safe to show to a model. */
    statusLine() {
        const quiet = ((Date.now() - this.lastOutputAt) / 1000).toFixed(1);
        const lease = this.leaseState.suspended ? `${this.leaseState.holder} (suspended)` : this.leaseState.holder;
        return [
            `session ${this.id}`,
            this.shellName,
            `cwd ${this.cwdValue}`,
            `${this.screen.cols}x${this.screen.rows}`,
            `alt=${this.screen.alt ? 'yes' : 'no'}`,
            `lease=${lease}`,
            `access=${this.agentAccessValue}`,
            `pending=${this.pendingCommands.length}`,
            `phase=${this.phaseValue}`,
            `rev=${this.revision}`,
            `quiet=${quiet}s`,
            ...(this.canceledPendingValue === null
                ? []
                : [`canceled=${this.canceledPendingValue.command}`]),
        ].join(' | ');
    }
    /** Styled screen for a browser terminal attaching to this session. */
    serialize() {
        return this.screen.serialize();
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    /**
     * Raw terminal output, for an attach stream that renders ANSI itself.
     * Agent-facing projections never use this.
     */
    onOutput(listener) {
        this.outputListeners.add(listener);
        return () => {
            this.outputListeners.delete(listener);
        };
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        if (this.pollTimer)
            clearInterval(this.pollTimer);
        this.pty.kill('SIGHUP');
        await Promise.race([this.exitPromise, delay(1500)]);
        if (!this.pty.hasExited)
            this.pty.kill('SIGKILL');
        await Promise.race([this.exitPromise, delay(1000)]);
        this.screen.dispose();
        this.launch.cleanup();
        this.phaseValue = 'exited';
        this.notify();
    }
    onMarker(data) {
        const kind = data.charAt(0);
        if (kind === 'A') {
            this.promptReady = false;
        }
        else if (kind === 'B') {
            this.childSeen = false;
            if (this.leaseState.suspended && this.leaseState.reason === 'secret-prompt') {
                // A shell prompt proves no secret is pending: the match was a false
                // positive, or the person already answered.
                this.leaseState = { holder: 'agent', since: Date.now(), reason: 'handback', suspended: false };
            }
            this.markPromptReady();
        }
        else if (kind === 'D') {
            const code = Number.parseInt(data.slice(2), 10);
            this.lastExitCode = Number.isNaN(code) ? null : code;
            this.promptReady = false;
        }
        this.refreshPhase();
    }
    poll() {
        if (this.closed || this.phaseValue === 'exited')
            return;
        const next = inspectForeground(this.pty.pid);
        const changed = (next?.pgid ?? -1) !== (this.fg?.pgid ?? -1) ||
            (next?.inputWaiting ?? false) !== (this.fg?.inputWaiting ?? false);
        this.fg = next;
        // Shells without prompt integration (zsh, fish) still need a readiness
        // signal. The foreground group plus a short quiet window is enough: a
        // forked child keeps the group away from the shell, and shell builtins
        // finish far inside the window.
        const shellForeground = !next || next.pgid === this.pty.pid;
        const quietFor = Date.now() - this.lastOutputAt;
        if (!shellForeground) {
            // A submitted command that has forked is no longer waiting for Enter to
            // be processed, so the settle guard can drop even while it runs.
            this.childSeen = true;
            this.awaitingCommand = false;
        }
        else if (this.awaitingCommand) {
            if ((this.childSeen && quietFor >= 80) || quietFor >= 250) {
                this.childSeen = false;
                this.markPromptReady();
            }
        }
        else if (!this.promptReady && this.sawOutput && quietFor >= 250) {
            this.markPromptReady();
        }
        if (changed)
            this.refreshPhase();
    }
    markPromptReady() {
        this.promptReady = true;
        this.sawPrompt = true;
        this.awaitingCommand = false;
        const resolvers = this.readyResolvers.splice(0);
        for (const resolve of resolvers)
            resolve();
        this.refreshPhase();
    }
    refreshPhase() {
        if (this.phaseValue === 'exited')
            return;
        let next;
        if (this.fg && this.fg.pgid !== this.pty.pid) {
            next = this.fg.inputWaiting ? 'waiting_input' : 'running';
        }
        else if (this.promptReady) {
            next = 'idle';
        }
        else {
            next = this.sawPrompt ? 'running' : 'starting';
        }
        if (next !== this.phaseValue) {
            this.phaseValue = next;
            this.notify();
        }
    }
    buildWaitResult(outcome, started) {
        const view = this.buildView(this.phaseValue === 'waiting_input' || this.screen.alt ? 'screen' : 'output');
        return {
            outcome,
            phase: this.phaseValue,
            view,
            status: this.statusLine(),
            revision: this.revision,
            elapsedMs: Date.now() - started,
        };
    }
    buildView(mode, options = {}) {
        const effective = mode === 'auto' ? (this.screen.alt ? 'screen' : 'output') : mode;
        if (effective === 'screen') {
            const all = this.screen.lines();
            const bounded = all.length > MAX_SCREEN_ROWS ? all.slice(-MAX_SCREEN_ROWS) : all;
            const offset = leadingBlankCount(bounded);
            const lines = trimBlankEdges(bounded);
            let changedRows;
            if (options.sinceRevision !== undefined && options.sinceRevision === this.lastViewRevision) {
                const changed = diffRows(this.lastViewLines, lines);
                changedRows =
                    changed.length > Math.max(8, Math.floor(lines.length * 0.6))
                        ? undefined
                        : changed.map((index) => index - offset).filter((index) => index >= 0);
            }
            this.lastViewLines = lines;
            this.lastViewRevision = this.revision;
            return {
                mode: 'screen',
                text: lines.join('\n'),
                ...(changedRows ? { changedRows } : {}),
                truncated: lines.length < all.length,
            };
        }
        const lines = this.screen.tail(MAX_OUTPUT_ROWS);
        return { mode: 'output', text: lines.join('\n'), truncated: false };
    }
    notify() {
        if (this.notifyScheduled)
            return;
        this.notifyScheduled = true;
        setTimeout(() => {
            this.notifyScheduled = false;
            for (const listener of this.listeners) {
                try {
                    listener();
                }
                catch {
                    // A faulty listener must not break the session.
                }
            }
        }, 0);
    }
    static SECRET_PROMPT = /(?:password|passphrase|passcode|enter pin)[^a-z0-9]*:?\s*$/i;
    /**
     * A credential prompt at the end of the visible screen suspends the agent.
     * Detection is deliberately narrow: the match must be on the last non-empty
     * row of a session that is currently running a command, so a line printed
     * and followed by a prompt does not trigger it.
     */
    detectSecretPrompt() {
        if (this.secretMuted || this.leaseState.suspended || this.phaseValue === 'exited')
            return;
        if (!this.awaitingCommand && !this.childSeen)
            return;
        const lines = this.screen.lines();
        const last = lines[lines.length - 1]?.trim() ?? '';
        if (last.length === 0 || last.length > 120)
            return;
        if (!TerminalSession.SECRET_PROMPT.test(last))
            return;
        this.leaseState = { holder: 'human', since: Date.now(), reason: 'secret-prompt', suspended: true };
        this.notify();
    }
    assertAgentMayWrite() {
        if (this.agentAccessValue === 'sealed') {
            throw new SessionError('the user has sealed this terminal; ask them to reconnect it', 'SEALED');
        }
        if (this.agentAccessValue === 'observe') {
            throw new SessionError('the user has made this terminal read-only', 'READ_ONLY');
        }
    }
    assertAgentMayRead() {
        if (this.agentAccessValue === 'sealed') {
            throw new SessionError('the user has sealed this terminal; ask them to reconnect it', 'SEALED');
        }
    }
    assertUsable() {
        if (this.closed)
            throw new SessionError(`session ${this.id} is closed`, 'CLOSED');
        if (this.phaseValue === 'exited') {
            throw new SessionError(`session ${this.id} has exited`, 'CLOSED');
        }
    }
}
function diffRows(previous, next) {
    const changed = [];
    const length = Math.max(previous.length, next.length);
    for (let index = 0; index < length; index += 1) {
        if ((previous[index] ?? '') !== (next[index] ?? ''))
            changed.push(index);
    }
    return changed;
}
function previewOf(text) {
    const flat = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    return flat.length > 80 ? `${flat.slice(0, 77)}...` : flat;
}
function leadingBlankCount(lines) {
    const index = lines.findIndex((line) => line.trim() !== '');
    return index < 0 ? lines.length : index;
}
function trimBlankEdges(lines) {
    let start = 0;
    let end = lines.length;
    while (start < end && (lines[start] ?? '').trim() === '')
        start += 1;
    while (end > start && (lines[end - 1] ?? '').trim() === '')
        end -= 1;
    return lines.slice(start, end);
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=session.js.map