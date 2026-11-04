/**
 * Thin node-pty wrapper. Everything here is about the process; text projection
 * and session semantics live above this layer.
 *
 * @module agent-interactive-terminal/pty
 */
import pty, { type IPty } from 'node-pty'

export interface PtySpawnOptions {
  file: string
  args: readonly string[]
  cwd: string
  env: Record<string, string | undefined>
  cols: number
  rows: number
}

export interface PtyExit {
  exitCode: number
  signal?: number | undefined
}

export class PtyProcess {
  private readonly child: IPty
  private readonly dataListeners = new Set<(data: string) => void>()
  private readonly exitListeners = new Set<(event: PtyExit) => void>()
  private exited = false

  constructor(options: PtySpawnOptions) {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(options.env)) {
      if (value !== undefined) env[key] = value
    }
    this.child = pty.spawn(options.file, [...options.args], {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env,
    })
    this.child.onData((data) => {
      for (const listener of this.dataListeners) listener(data)
    })
    this.child.onExit(({ exitCode, signal }) => {
      this.exited = true
      for (const listener of this.exitListeners) listener({ exitCode, signal })
    })
  }

  get pid(): number {
    return this.child.pid
  }

  get hasExited(): boolean {
    return this.exited
  }

  write(data: string): void {
    if (this.exited) return
    this.child.write(data)
  }

  resize(cols: number, rows: number): void {
    if (this.exited) return
    this.child.resize(cols, rows)
  }

  kill(signal?: string): void {
    if (this.exited) return
    try {
      this.child.kill(signal)
    } catch {
      // The process may already be gone; killing is best effort.
    }
  }

  onData(listener: (data: string) => void): () => void {
    this.dataListeners.add(listener)
    return () => {
      this.dataListeners.delete(listener)
    }
  }

  onExit(listener: (event: PtyExit) => void): () => void {
    this.exitListeners.add(listener)
    return () => {
      this.exitListeners.delete(listener)
    }
  }
}
