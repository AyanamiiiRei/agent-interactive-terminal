export interface ScreenOptions {
    cols: number;
    rows: number;
    /** Lines of history retained above the viewport. */
    scrollback?: number;
}
export interface CursorState {
    row: number;
    col: number;
}
/**
 * Wraps a headless xterm instance and exposes text projections.
 *
 * The emulator is fed the same byte stream the browser would receive, so both
 * projections agree on cursor position, alternate screen state, and reflow
 * after a resize.
 */
export declare class ScreenModel {
    private readonly term;
    private readonly serializer;
    private revision;
    private titleValue;
    private disposed;
    private altCarry;
    constructor(options: ScreenOptions);
    get cols(): number;
    get rows(): number;
    /** True when a TUI has taken over the alternate screen buffer. */
    get alt(): boolean;
    get title(): string;
    get revisionNumber(): number;
    /** Feed terminal output and resolve once xterm has parsed it. */
    write(data: string): Promise<void>;
    /**
     * xterm.js clears the alternate buffer on DECSET 1049 but leaves the cursor
     * where it was, while a real terminal also homes it. Full-screen programs
     * such as less rely on that home and draw at the old cursor row otherwise,
     * so the sequence is rewritten to include an explicit cursor home.
     */
    private normalizeAltScreen;
    resize(cols: number, rows: number): void;
    /**
     * Current screen as logical lines, soft-wrapped continuations joined and
     * trailing blank lines dropped.
     */
    lines(): string[];
    /** The last `count` lines including scrollback, for reading output tails. */
    tail(count: number): string[];
    cursor(): CursorState;
    /** Fully styled screen snapshot, used by a browser terminal on attach. */
    serialize(): string;
    /** Register device-attribute replies that must be written back to the PTY. */
    onData(listener: (data: string) => void): () => void;
    onBell(listener: () => void): () => void;
    /** Consume a private OSC channel used for shell prompt markers. */
    onOsc(ident: number, listener: (data: string) => void): () => void;
    dispose(): void;
    private project;
}
//# sourceMappingURL=model.d.ts.map