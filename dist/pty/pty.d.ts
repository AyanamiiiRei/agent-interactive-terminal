export interface PtySpawnOptions {
    file: string;
    args: readonly string[];
    cwd: string;
    env: Record<string, string | undefined>;
    cols: number;
    rows: number;
}
export interface PtyExit {
    exitCode: number;
    signal?: number | undefined;
}
export declare class PtyProcess {
    private readonly child;
    private readonly dataListeners;
    private readonly exitListeners;
    private exited;
    constructor(options: PtySpawnOptions);
    get pid(): number;
    get hasExited(): boolean;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(signal?: string): void;
    onData(listener: (data: string) => void): () => void;
    onExit(listener: (event: PtyExit) => void): () => void;
}
//# sourceMappingURL=pty.d.ts.map