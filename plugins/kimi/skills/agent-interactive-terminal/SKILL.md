---
name: agent-interactive-terminal
description: Use the shared terminal when work is interactive, long-running, stateful, or needs a real PTY.
---

# Agent Interactive Terminal

The `mcp__ait__terminal_*` tools open a real shell that you and the user share. The user watches the same PTY in a browser panel and can take over the keyboard.

Kimi Code's built-in `Bash` tool remains the right choice for a short one-shot command whose output you only need once. Use `mcp__ait__terminal_open` when sharing a live session matters.

## When to use it

- A REPL, package manager, database client, TUI program, or anything that may prompt for input.
- A long-running build, test, or deployment whose progress the user may want to watch.
- A workflow with several dependent steps where the live session should stay visible and the user may want to correct it.
- A command that may require the user to type a password or other secret.

## Tools

- `mcp__ait__terminal_open` opens a session and returns its id, status, initial screen, and a local browser panel URL when available.
- `mcp__ait__terminal_send` writes text, submits it by default, and waits for the command to settle.
- `mcp__ait__terminal_wait` observes output or picks up after a human interaction without writing.
- `mcp__ait__terminal_snapshot` reads the current screen or output tail.
- `mcp__ait__terminal_key` presses one named key, such as `enter`, `escape`, `ctrl-c`, or an arrow key.
- `mcp__ait__terminal_resize` changes the terminal size.
- `mcp__ait__terminal_close` closes a session you no longer need.
- `mcp__ait__terminal_list` lists open sessions.

## Working rules

- Show the browser panel URL to the user once, near the start of the work.
- Before `terminal_send` or `terminal_key` submits something, say in one short sentence what you are about to run. When a command asks Y or N, say which answer you are giving. Do not narrate every line of output.
- When a result says `human_required`, the user must type in the panel. Ask them to do it, then call `terminal_wait` if the command has not settled.
- The panel can take over, hand back, make a session read-only, seal it, or close it. Respect those states; do not open a replacement session to get around them.
- Passwords and other secrets are entered by the person in the panel. Never ask for or type a password yourself.
- The shared terminal runs outside Kimi Code's own tool sandbox. Do not use it to bypass approval, permission, or security rules; use it because the task needs a shared interactive shell.
- Close sessions you no longer need with `terminal_close`.
