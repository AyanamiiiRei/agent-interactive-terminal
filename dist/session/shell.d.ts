export interface ShellLaunch {
    file: string;
    args: string[];
    /** Environment entries the launch itself needs, such as ZDOTDIR. */
    env?: Record<string, string>;
    /** Directory of generated files to remove when the session closes. */
    cleanup(): void;
}
/** Choose the shell to run, preferring an explicit path, then `$SHELL`. */
export declare function resolveShell(explicit?: string): string;
/** Build the executable, arguments, and any generated startup files. */
export declare function buildShellLaunch(shell: string): ShellLaunch;
//# sourceMappingURL=shell.d.ts.map