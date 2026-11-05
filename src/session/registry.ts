/**
 * In-process registry of terminal sessions.
 * @module agent-interactive-terminal/registry
 */
import { createHash } from 'node:crypto'
import { SessionError } from '../errors.js'
import type { OpenOptions } from '../types.js'
import { TerminalSession } from './session.js'

export interface RegistryOptions {
  /** Upper bound on concurrently open sessions. */
  maxSessions?: number
}

export class TerminalRegistry {
  private readonly sessions = new Map<string, TerminalSession>()
  private readonly maxSessions: number
  /** Short, human-readable ordinals instead of opaque session hashes. */
  private nextOrdinal = 1

  constructor(options: RegistryOptions = {}) {
    this.maxSessions = options.maxSessions ?? 4
  }

  /** Open a session and publish it under a fresh id. */
  async open(options: OpenOptions = {}): Promise<TerminalSession> {
    if (this.sessions.size >= this.maxSessions) {
      throw new SessionError(
        `session limit reached (${this.maxSessions}); close one before opening another`,
        'SPAWN_FAILED',
      )
    }
    if (options.name !== undefined && this.findByName(options.name)) {
      throw new SessionError(`a session named ${options.name} already exists`, 'SPAWN_FAILED')
    }
    const id = String(this.nextOrdinal++)
    const session = await TerminalSession.open({ ...options, id })
    this.sessions.set(id, session)
    return session
  }

  get(id: string): TerminalSession | undefined {
    return this.sessions.get(id)
  }

  /** Resolve a session id or throw a routable error. */
  require(id: string): TerminalSession {
    const session = this.sessions.get(id)
    if (!session) throw new SessionError(`no terminal session ${id}`, 'NO_SESSION')
    return session
  }

  list(): TerminalSession[] {
    return [...this.sessions.values()]
  }

  /**
   * Two or three lines describing every open session, plus a version that
   * changes only when the summary changes. Callers can inject the text into a
   * system prompt when the version differs from the last one they sent.
   */
  capsule(): { text: string; version: string } {
    const lines = this.list().map((session) => session.capsuleLine())
    const text = lines.join('\n')
    const version = createHash('sha1').update(text).digest('hex').slice(0, 12)
    return { text, version }
  }

  async close(id: string): Promise<boolean> {
    const session = this.sessions.get(id)
    if (!session) return false
    this.sessions.delete(id)
    await session.close()
    return true
  }

  async closeAll(): Promise<void> {
    const all = [...this.sessions.values()]
    this.sessions.clear()
    await Promise.all(all.map((session) => session.close()))
  }

  private findByName(name: string): TerminalSession | undefined {
    return this.list().find((session) => session.name === name)
  }
}
