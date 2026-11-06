export interface ShellLaunch {
    file: string;
    args: string[];
    /** Environment entries the launch itself needs, such as ZDOTDIR. */
    env?: Record<string, string>;
    /** Short label for status lines, such as `zsh (WSL)` or `PowerShell`. */
    label?: string;
    /** True when the generated shell rc emits the 9999 prompt markers. */
    markers?: boolean;
    /** Directory of generated files to remove when the session closes. */
    cleanup(): void;
}
export interface LaunchOptions {
    /** Platform to resolve for, injectable for tests. */
    platform?: NodeJS.Platform;
    /** Environment to resolve against, injectable for tests. */
    env?: NodeJS.ProcessEnv;
}
/** Locate one executable on PATH without starting it. */
export declare function findExecutable(file: string, platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): string | undefined;
/**
 * Choose the shell to run.
 *
 * macOS follows `$SHELL` and falls back to `/bin/zsh`; Linux falls back to
 * `/bin/bash`. On Windows the value is a *choice* (`auto`, `zsh`, `bash`) that
 * {@link buildShellLaunch} resolves to WSL or a native fallback.
 */
export declare function resolveShell(explicit?: string, platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): string;
/** One plain WSL interactive shell, used when rc translation is unavailable. */
export declare function wslLaunch(shell: 'bash' | 'zsh', executable?: string, rc?: {
    dir: string;
    userHome?: string | undefined;
}): ShellLaunch;
/** PowerShell fallback for a Windows host without WSL. */
export declare function powershellLaunch(executable: string, label?: string): ShellLaunch;
/** cmd.exe fallback for a Windows host without WSL or PowerShell. */
export declare function cmdLaunch(executable: string, label?: string): ShellLaunch;
/** Build the executable, arguments, and any generated startup files. */
export declare function buildShellLaunch(shell?: string, options?: LaunchOptions): ShellLaunch;
//# sourceMappingURL=shell.d.ts.map