/**
 * Public entry point.
 * @module agent-interactive-terminal
 */
export { SessionError, type SessionErrorCode } from './errors.js';
export { PtyProcess, type PtyExit, type PtySpawnOptions } from './pty/pty.js';
export { inspectForeground, signalGroup, type ForegroundInfo } from './pty/proc.js';
export { ScreenModel, type CursorState, type ScreenOptions } from './screen/model.js';
export { TerminalSession, type LeaseState, type SessionInit, type SnapshotResult } from './session/session.js';
export { TerminalRegistry, type RegistryOptions } from './session/registry.js';
export { buildShellLaunch, cmdLaunch, findExecutable, powershellLaunch, resolveShell, wslLaunch, type LaunchOptions, type ShellLaunch, } from './session/shell.js';
export { createTerminalTools, toolIndex, type JsonSchema, type JsonSchemaProperty, type TerminalTool, type ToolResult, type ToolkitOptions, } from './tools/index.js';
export type { AuditEntry, Holder, NamedKey, OpenOptions, ScreenSnapshot, SessionPhase, TerminalView, ViewMode, WaitOutcome, WaitResult, WaitSpec, WriteOrigin, } from './types.js';
//# sourceMappingURL=index.d.ts.map