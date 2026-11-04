/**
 * One terminal emulator per session. This is the single source of truth for
 * what is currently on screen; every other view is a projection of it.
 *
 * @module agent-interactive-terminal/screen
 */
import xterm, {} from '@xterm/headless';
import serialize from '@xterm/addon-serialize';
const { Terminal } = xterm;
const { SerializeAddon } = serialize;
/**
 * Wraps a headless xterm instance and exposes text projections.
 *
 * The emulator is fed the same byte stream the browser would receive, so both
 * projections agree on cursor position, alternate screen state, and reflow
 * after a resize.
 */
export class ScreenModel {
    term;
    serializer;
    revision = 0;
    titleValue = '';
    disposed = false;
    altCarry = '';
    constructor(options) {
        this.term = new Terminal({
            cols: options.cols,
            rows: options.rows,
            scrollback: options.scrollback ?? 2000,
            allowProposedApi: true,
        });
        this.serializer = new SerializeAddon();
        this.term.loadAddon(this.serializer);
        this.term.onTitleChange((title) => {
            this.titleValue = title;
        });
    }
    get cols() {
        return this.term.cols;
    }
    get rows() {
        return this.term.rows;
    }
    /** True when a TUI has taken over the alternate screen buffer. */
    get alt() {
        return this.term.buffer.active.type === 'alternate';
    }
    get title() {
        return this.titleValue;
    }
    get revisionNumber() {
        return this.revision;
    }
    /** Feed terminal output and resolve once xterm has parsed it. */
    async write(data) {
        if (this.disposed)
            return;
        const normalized = this.normalizeAltScreen(data);
        if (normalized.length === 0) {
            this.revision += 1;
            return;
        }
        await new Promise((resolve) => {
            this.term.write(normalized, resolve);
        });
        this.revision += 1;
    }
    /**
     * xterm.js clears the alternate buffer on DECSET 1049 but leaves the cursor
     * where it was, while a real terminal also homes it. Full-screen programs
     * such as less rely on that home and draw at the old cursor row otherwise,
     * so the sequence is rewritten to include an explicit cursor home.
     */
    normalizeAltScreen(chunk) {
        const data = this.altCarry + chunk;
        this.altCarry = '';
        const patterns = ['\x1b[?1049h', '\x1b[?1047h'];
        let hold = 0;
        for (let length = Math.min(8, data.length); length >= 1; length -= 1) {
            const suffix = data.slice(-length);
            if (patterns.includes(suffix))
                continue;
            if (patterns.some((pattern) => pattern.startsWith(suffix))) {
                hold = length;
                break;
            }
        }
        const body = hold > 0 ? data.slice(0, data.length - hold) : data;
        this.altCarry = hold > 0 ? data.slice(-hold) : '';
        return body
            .replaceAll('\x1b[?1049h', '\x1b[?1049h\x1b[H')
            .replaceAll('\x1b[?1047h', '\x1b[?1047h\x1b[H');
    }
    resize(cols, rows) {
        if (this.disposed)
            return;
        if (cols === this.term.cols && rows === this.term.rows)
            return;
        this.term.resize(cols, rows);
        this.revision += 1;
    }
    /**
     * Current screen as logical lines, soft-wrapped continuations joined and
     * trailing blank lines dropped.
     */
    lines() {
        return this.project();
    }
    /** The last `count` lines including scrollback, for reading output tails. */
    tail(count) {
        if (this.disposed)
            return [];
        const buffer = this.term.buffer.active;
        const bottom = Math.min(buffer.baseY + this.term.rows, buffer.length);
        const start = Math.max(0, bottom - count);
        const out = [];
        let current;
        for (let y = start; y < bottom; y += 1) {
            const line = buffer.getLine(y);
            if (!line)
                continue;
            const text = line.translateToString(true);
            if (line.isWrapped && current !== undefined) {
                current += text;
                continue;
            }
            if (current !== undefined)
                out.push(current);
            current = text;
        }
        if (current !== undefined)
            out.push(current);
        while (out.length > 0 && (out[out.length - 1] ?? '').trim() === '') {
            out.pop();
        }
        return out;
    }
    cursor() {
        const buffer = this.term.buffer.active;
        return { row: buffer.cursorY, col: buffer.cursorX };
    }
    /** Fully styled screen snapshot, used by a browser terminal on attach. */
    serialize() {
        if (this.disposed)
            return '';
        return this.serializer.serialize();
    }
    /** Register device-attribute replies that must be written back to the PTY. */
    onData(listener) {
        const disposable = this.term.onData(listener);
        return () => disposable.dispose();
    }
    onBell(listener) {
        const disposable = this.term.onBell(listener);
        return () => disposable.dispose();
    }
    /** Consume a private OSC channel used for shell prompt markers. */
    onOsc(ident, listener) {
        const disposable = this.term.parser.registerOscHandler(ident, (data) => {
            listener(data);
            return true;
        });
        return () => disposable.dispose();
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.serializer.dispose();
        this.term.dispose();
    }
    project() {
        if (this.disposed)
            return [];
        const buffer = this.term.buffer.active;
        const top = buffer.baseY;
        const out = [];
        for (let y = top; y < top + this.term.rows; y += 1) {
            const line = buffer.getLine(y);
            if (!line)
                continue;
            const text = y - top === buffer.cursorY && buffer.cursorX > 0
                ? stripSuggestion(line, buffer.cursorX, this.term.cols)
                : line.translateToString(true);
            if (line.isWrapped && out.length > 0) {
                out[out.length - 1] = (out[out.length - 1] ?? '') + text;
                continue;
            }
            out.push(text);
        }
        while (out.length > 0 && (out[out.length - 1] ?? '').trim() === '') {
            out.pop();
        }
        return out;
    }
}
/**
 * Drop trailing suggestion text painted after the cursor.
 *
 * zsh-autosuggestions and similar tools render the suggestion in place, dimmed
 * or in colour 8. The cursor tells us where the typed text ends, so anything
 * after it carrying those attributes is treated as a hint and removed.
 */
function stripSuggestion(line, cursorX, cols) {
    if (cursorX >= cols - 1) {
        return line.translateToString(true);
    }
    for (let x = cursorX; x < cols; x += 1) {
        const cell = line.getCell(x);
        if (!cell)
            continue;
        if (cell.getChars().length === 0)
            continue;
        const palette = cell.isFgPalette() ? cell.getFgColor() : -1;
        const hint = cell.isDim() || palette === 8 || (palette >= 240 && palette <= 245);
        if (hint) {
            return line.translateToString(true, 0, x);
        }
    }
    return line.translateToString(true);
}
//# sourceMappingURL=model.js.map