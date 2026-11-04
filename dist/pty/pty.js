/**
 * Thin node-pty wrapper. Everything here is about the process; text projection
 * and session semantics live above this layer.
 *
 * @module agent-interactive-terminal/pty
 */
import pty, {} from 'node-pty';
export class PtyProcess {
    child;
    dataListeners = new Set();
    exitListeners = new Set();
    exited = false;
    constructor(options) {
        const env = {};
        for (const [key, value] of Object.entries(options.env)) {
            if (value !== undefined)
                env[key] = value;
        }
        this.child = pty.spawn(options.file, [...options.args], {
            name: 'xterm-256color',
            cols: options.cols,
            rows: options.rows,
            cwd: options.cwd,
            env,
        });
        this.child.onData((data) => {
            for (const listener of this.dataListeners)
                listener(data);
        });
        this.child.onExit(({ exitCode, signal }) => {
            this.exited = true;
            for (const listener of this.exitListeners)
                listener({ exitCode, signal });
        });
    }
    get pid() {
        return this.child.pid;
    }
    get hasExited() {
        return this.exited;
    }
    write(data) {
        if (this.exited)
            return;
        this.child.write(data);
    }
    resize(cols, rows) {
        if (this.exited)
            return;
        this.child.resize(cols, rows);
    }
    kill(signal) {
        if (this.exited)
            return;
        try {
            this.child.kill(signal);
        }
        catch {
            // The process may already be gone; killing is best effort.
        }
    }
    onData(listener) {
        this.dataListeners.add(listener);
        return () => {
            this.dataListeners.delete(listener);
        };
    }
    onExit(listener) {
        this.exitListeners.add(listener);
        return () => {
            this.exitListeners.delete(listener);
        };
    }
}
//# sourceMappingURL=pty.js.map