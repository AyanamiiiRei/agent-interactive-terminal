/**
 * Linux process inspection used to decide whether the foreground job is still
 * working or is blocked reading the terminal.
 *
 * @module agent-interactive-terminal/pty/proc
 */
import { readdirSync, readFileSync } from 'node:fs';
const TERMINAL_READ = /n_tty_read|tty_read|wait_woken|poll_schedule_timeout|do_select|core_sys_select/;
/**
 * Inspect the foreground process group of the terminal owned by `shellPid`.
 *
 * Returns undefined when `/proc` is unavailable or the process is gone, which
 * makes the caller fall back to prompt markers and output silence.
 */
export function inspectForeground(shellPid, platform = process.platform) {
    // /proc exists only on Linux. macOS and Windows fall back to prompt markers
    // and output silence instead of process-table inspection.
    if (platform !== 'linux')
        return undefined;
    const shell = readStat(shellPid);
    if (!shell)
        return undefined;
    const pgid = shell.tpgid;
    if (pgid <= 0)
        return undefined;
    if (pgid === shellPid) {
        return { pgid, inputWaiting: false, command: shell.comm };
    }
    const leader = readStat(pgid);
    if (leader) {
        return {
            pgid,
            inputWaiting: isWaitingOnTerminal(pgid),
            command: leader.comm,
        };
    }
    // A pipeline's group id can belong to a process that already exited while
    // another member survives. Look at the members only in that case.
    const member = findGroupMember(pgid);
    if (!member)
        return { pgid, inputWaiting: false };
    return { pgid, inputWaiting: isWaitingOnTerminal(member), command: readStat(member)?.comm };
}
/** Deliver a signal to a process group, which is how a terminal job is stopped. */
export function signalGroup(pgid, signal) {
    if (pgid <= 0)
        throw new Error(`refusing to signal invalid process group ${pgid}`);
    try {
        process.kill(-pgid, signal);
    }
    catch (error) {
        const code = error.code;
        if (code !== 'ESRCH')
            throw error;
    }
}
function readStat(pid) {
    try {
        const raw = readFileSync(`/proc/${pid}/stat`, 'utf8');
        const close = raw.lastIndexOf(')');
        if (close < 0)
            return undefined;
        const comm = raw.slice(raw.indexOf('(') + 1, close);
        const fields = raw.slice(close + 2).trim().split(/\s+/);
        return {
            state: fields[0] ?? '',
            pgrp: Number(fields[2] ?? -1),
            tpgid: Number(fields[5] ?? -1),
            comm,
        };
    }
    catch {
        return undefined;
    }
}
function isWaitingOnTerminal(pid) {
    try {
        const wchan = readFileSync(`/proc/${pid}/wchan`, 'utf8').trim();
        if (TERMINAL_READ.test(wchan))
            return true;
    }
    catch {
        // Fall through to the process-tree check.
    }
    // Some kernels report an empty wchan for a blocked read; a single-threaded
    // process in state S whose only open descriptor is the tty still counts.
    return false;
}
function findGroupMember(pgid) {
    let entries;
    try {
        entries = readdirSync('/proc');
    }
    catch {
        return undefined;
    }
    for (const entry of entries) {
        if (!/^\d+$/.test(entry))
            continue;
        const stat = readStat(Number(entry));
        if (stat && stat.pgrp === pgid)
            return Number(entry);
    }
    return undefined;
}
//# sourceMappingURL=proc.js.map