/**
 * Shared vocabulary for sessions, waits, and projections.
 * @module agent-interactive-terminal/types
 */

/** Coarse phase of a terminal session. Exactly one is true at a time. */
export type SessionPhase = 'starting' | 'running' | 'waiting_input' | 'idle' | 'exited'

/** Why one wait call returned. This is not a session phase. */
export type WaitOutcome =
  | 'matched'
  | 'quiet'
  | 'settled'
  | 'timeout'
  | 'exited'
  | 'human_required'
  | 'human_took_over'
  | 'lease_denied'

/** Which side currently owns the keyboard. */
export type Holder = 'agent' | 'human' | 'none'

/** Where a write came from, for audit and redaction. */
export type WriteOrigin = 'agent' | 'human' | 'system'

/** Which projection a caller wants back. */
export type ViewMode = 'auto' | 'screen' | 'output'

/** Conditions for one wait. The first satisfied condition settles the call. */
export interface WaitSpec {
  /** Literal substrings; any match on the visible screen settles the wait. */
  match?: readonly string[]
  /** Settle after this many milliseconds without terminal output. */
  quietMs?: number
  /** Absolute bound on the wait. Applied last. */
  timeoutMs?: number
  /** Phases that settle the wait. Defaults to `waiting_input` and `idle`. */
  settleOn?: readonly SessionPhase[]
}

/** One rendered projection of the session. */
export interface TerminalView {
  mode: 'screen' | 'output'
  /** Rendered text, never raw ANSI. */
  text: string
  /** Row indexes that changed since the caller's revision, when known. */
  changedRows?: readonly number[]
  /** True when the projection was truncated by a bound. */
  truncated: boolean
}

/** Facts about the terminal at one instant. */
export interface ScreenSnapshot {
  cols: number
  rows: number
  /** True when an alternate screen buffer is active, which means a TUI. */
  alt: boolean
  cursor: { row: number; col: number; visible: boolean }
  title: string
  /** Visible screen, soft-wrapped rows joined, trailing blank lines dropped. */
  lines: readonly string[]
  revision: number
}

/** Result of one wait call. */
export interface WaitResult {
  outcome: WaitOutcome
  phase: SessionPhase
  view: TerminalView
  /** One stable status line, safe to show to a model. */
  status: string
  revision: number
  elapsedMs: number
}

/** Options for opening a session. */
export interface OpenOptions {
  /** Display name, unique within the registry when provided. */
  name?: string
  /** Working directory. Defaults to the process working directory. */
  cwd?: string
  /** Executable to run. Defaults to the login shell, then `/bin/bash`. */
  shell?: string
  /** Arguments for the shell. Defaults to an interactive invocation. */
  args?: readonly string[]
  /** Extra environment entries layered over the parent environment. */
  env?: Readonly<Record<string, string>>
  cols?: number
  rows?: number
  /** Kind of owner. Agent sessions are sandboxed in a deployment; here it is metadata. */
  kind?: 'agent' | 'user'
  /**
   * Secret values resolved at spawn time. Each provider is called once, and the
   * resolved value goes into the environment without ever appearing in the
   * status line or the transcript.
   */
  secrets?: Readonly<Record<string, () => string | Promise<string>>>
}

/** Named keys the session can deliver, mirroring what a person would press. */
export type NamedKey =
  | 'enter'
  | 'tab'
  | 'escape'
  | 'backspace'
  | 'delete'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'home'
  | 'end'
  | 'page-up'
  | 'page-down'
  | 'ctrl-a'
  | 'ctrl-b'
  | 'ctrl-c'
  | 'ctrl-d'
  | 'ctrl-e'
  | 'ctrl-k'
  | 'ctrl-l'
  | 'ctrl-r'
  | 'ctrl-u'
  | 'ctrl-w'
  | 'ctrl-z'
