---
name: agent-interactive-terminal
description: Use the shared terminal when work is interactive, long-running, stateful, or needs a real PTY.
---

# Agent Interactive Terminal

The `terminal_*` tools open a real shell that you and the user share. The user
watches the same PTY in a browser panel and can take over the keyboard.

Codex may expose these MCP tools inside its unified `exec` tool, for example as
`tools.mcp__ait__terminal_open`; older versions list them as
`mcp__ait__terminal_open` or `terminal_open`. Use whichever names your tool list
provides. Codex's own `exec_command` is a separate PTY that the user cannot see
or type into from the browser panel; use the `terminal_*` tools when sharing the
live session matters.

## When to use it

- A REPL, package manager, database client, TUI program, or anything that may
  prompt for input.
- A long-running build or test run whose progress matters.
- A workflow with several dependent steps where the live session should stay
  visible and the user may want to correct it.

Use `exec_command` for a short one-shot command whose output you only need once.


## Working rules

- `terminal_open` returns the panel URL when a browser panel is available. Show
  that URL to the user once, near the start of the work.
- When a result says `human_required`, the user must type in the panel. Ask them
  to do that, then call `terminal_wait` if the command has not settled yet.
- Before a `terminal_send` or `terminal_key` that submits something, say in one
  short sentence what you are about to run. When a command asks Y or N, say
  which answer you are giving. Do not narrate every line of output.
- Use `sudo` inside the shared terminal when the user asks for privileged work.
  Never type a password yourself; the person answers password prompts in the
  panel.
- The terminal runs outside Codex's own sandbox. Do not use it to bypass an
  approval or a sandbox rule. Use it because the task needs a shared,
  interactive shell.
- Close sessions you no longer need with `terminal_close`.
