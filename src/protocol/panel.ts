/**
 * Host-neutral contracts shared by every terminal panel adapter.
 *
 * No module in this directory may import a host SDK (DSH, Codex, React) or a
 * Node runtime module. Adapters implement these contracts; the shared UI only
 * depends on them.
 */

export type PanelPhase = 'starting' | 'idle' | 'running' | 'waiting_input' | 'exited'
export type PanelHolder = 'agent' | 'human'
export type PanelAccess = 'collaborate' | 'observe' | 'sealed'
export type PanelAction = 'takeover' | 'handback' | 'observe' | 'collaborate' | 'sealed' | 'cancel-pending'

export interface SessionDescriptor {
  id: string
  name: string
  phase: PanelPhase | string
  holder: PanelHolder
  access: PanelAccess
  cols: number
  rows: number
  revision: number
  /** Monotonic value advanced only by agent-originated activity. */
  agentAt?: number
  pending?: number
}

export interface PanelStatus {
  sessionId: string
  phase: PanelPhase | string
  holder: PanelHolder
  access: PanelAccess
  suspended?: boolean
  cols: number
  rows: number
  revision: number
  pendingCommands?: Array<{ id: number; command: string; at?: number }>
  exited?: boolean
}

export interface AttachSnapshot {
  ansi: string
  cursor: number
  status: PanelStatus
}

export type PanelFrame =
  | { type: 'output'; data: string; cursor: number }
  | { type: 'status'; status: PanelStatus; cursor: number }
  | { type: 'exited'; exitCode?: number | null; cursor: number }

/**
 * The only surface the shared React panel needs from a host.
 *
 * DSH implements this with its WebSocket bridge; Codex implements it with
 * app-only MCP tools. The shared component must never branch on the host name.
 */
export interface PanelTransport {
  list(): Promise<SessionDescriptor[]>
  open(cols: number, rows: number): Promise<SessionDescriptor>
  close(sessionId: string): Promise<void>

  attach(sessionId: string): Promise<AttachSnapshot>
  stream(sessionId: string, cursor: number, signal?: AbortSignal): AsyncIterable<PanelFrame>

  write(sessionId: string, data: string): Promise<PanelStatus>
  resize(sessionId: string, cols: number, rows: number): Promise<void>
  action(sessionId: string, action: PanelAction): Promise<PanelStatus>
}

export interface PanelConfig {
  theme: 'dark' | 'light'
  labels: Record<string, string>
  idleHandbackMs: number
}
