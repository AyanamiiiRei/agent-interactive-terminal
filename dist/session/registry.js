/**
 * In-process registry of terminal sessions.
 * @module agent-interactive-terminal/registry
 */
import { createHash } from 'node:crypto';
import { SessionError } from '../errors.js';
import { TerminalSession } from './session.js';
export class TerminalRegistry {
    sessions = new Map();
    maxSessions;
    /** Short, human-readable ordinals instead of opaque session hashes. */
    nextOrdinal = 1;
    constructor(options = {}) {
        this.maxSessions = options.maxSessions ?? 4;
    }
    /** Open a session and publish it under a fresh id. */
    async open(options = {}) {
        if (this.sessions.size >= this.maxSessions) {
            throw new SessionError(`session limit reached (${this.maxSessions}); close one before opening another`, 'SPAWN_FAILED');
        }
        if (options.name !== undefined && this.findByName(options.name)) {
            throw new SessionError(`a session named ${options.name} already exists`, 'SPAWN_FAILED');
        }
        const id = String(this.nextOrdinal++);
        const session = await TerminalSession.open({ ...options, id });
        this.sessions.set(id, session);
        return session;
    }
    get(id) {
        return this.sessions.get(id);
    }
    /** Resolve a session id or throw a routable error. */
    require(id) {
        const session = this.sessions.get(id);
        if (!session)
            throw new SessionError(`no terminal session ${id}`, 'NO_SESSION');
        return session;
    }
    list() {
        return [...this.sessions.values()];
    }
    /**
     * Two or three lines describing every open session, plus a version that
     * changes only when the summary changes. Callers can inject the text into a
     * system prompt when the version differs from the last one they sent.
     */
    capsule() {
        const lines = this.list().map((session) => session.capsuleLine());
        const text = lines.join('\n');
        const version = createHash('sha1').update(text).digest('hex').slice(0, 12);
        return { text, version };
    }
    async close(id) {
        const session = this.sessions.get(id);
        if (!session)
            return false;
        this.sessions.delete(id);
        await session.close();
        return true;
    }
    async closeAll() {
        const all = [...this.sessions.values()];
        this.sessions.clear();
        await Promise.all(all.map((session) => session.close()));
    }
    findByName(name) {
        return this.list().find((session) => session.name === name);
    }
}
//# sourceMappingURL=registry.js.map