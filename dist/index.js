/**
 * Public entry point.
 * @module agent-interactive-terminal
 */
export { SessionError } from './errors.js';
export { PtyProcess } from './pty/pty.js';
export { inspectForeground, signalGroup } from './pty/proc.js';
export { ScreenModel } from './screen/model.js';
export { TerminalSession } from './session/session.js';
export { TerminalRegistry } from './session/registry.js';
export { resolveShell } from './session/shell.js';
export { createTerminalTools, toolIndex, } from './tools/index.js';
//# sourceMappingURL=index.js.map