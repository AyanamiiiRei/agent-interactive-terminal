# Agent Interactive Terminal

Stateful, PTY-backed terminal sessions that an LLM agent and a human can share.

> **Status: early implementation.** M1 is in place, and the M2 session layer
> has landed too: a real PTY, a headless screen model, phase and wait handling,
> the eight model-facing tools, a single-writer control lease, password
> suspension, and secret injection, all with tests. What remains from M2 is the
> browser attach to a live session and the per-write audit record. The design
> document in [docs/design.zh.md](docs/design.zh.md) remains the reference for
> the target interfaces.

## The problem

Every terminal an agent can call today is really `exec`: spawn a child process,
wait for it to exit, collect stdout and stderr. That model is stateless,
one-shot, and pipe based. It has no TTY, so programs never enter interactive
mode, shell startup files are not loaded the way a person would expect, long
tasks show no progress, and a human cannot work in the same terminal as the
agent without copying text back and forth.

The usual workarounds all fail in the same place. Feeding `yes` into stdin is
not the same as answering a prompt. Polling a pipe for a password prompt leaks
the password into the transcript. Waiting for silence cannot tell a finished
command from a slow one, and no amount of parsing raw ANSI bytes gives the
agent a picture of what is currently on screen.

## The proposal

A persistent terminal session is a resource with an identity, a screen, an
activity state, and a control lease. Tools operate on `session_id` and get back
a rendered screen plus a status line, never a raw byte stream.

- **Real PTY.** Sessions run on a pseudo terminal, so programs detect a
  terminal, enter interactive mode, render progress, and load their startup
  files.
- **Screen, not stream.** A terminal emulator turns ANSI into a current screen.
  The agent pulls a discrete snapshot; it never subscribes to a live feed.
- **Wait conditions.** A call can wait for a literal pattern, for output to go
  quiet, for a timeout, for the shell to become idle, or for the process to
  exit, whichever happens first.
- **One writer at a time.** A lease decides whether the agent or the human owns
  the keyboard. The human can take over at any moment; the agent cannot take it
  back on its own.
- **Password handoff.** When a credential prompt appears, the session suspends
  the agent, hands control to the human, and tells the model to stop. The secret
  never enters the model context.
- **Wake on events.** Log watching reuses the existing background job channel,
  so an idle agent is woken when a pattern fires instead of polling forever.

## Try it

Requires Node.js 20 or newer and a C++ toolchain for `node-pty`. Development
and CI target Linux: the foreground-process inspection uses `/proc`, and macOS
and Windows are not verified yet, so the session falls back to prompt markers
and quiet time there.

```bash
git clone https://github.com/AyanamiiiRei/agent-interactive-terminal.git
cd agent-interactive-terminal
npm install
npm test
npm run demo -- "git status"
npm run attach        # then open http://127.0.0.1:7787/
```

`npm run demo` without arguments starts an interactive loop that drives the
session through the same tool surface the model sees:

```text
› ls
› /snap
› /wait 5000
› /key ctrl-c
› /resize 120 40
› /quit
```

## Use it from code

The library has no agent-framework dependency. Use the session directly when you
know what to wait for:

```ts
import { TerminalRegistry } from 'agent-interactive-terminal'

const sessions = new TerminalRegistry({ maxSessions: 2 })
const session = await sessions.open({ name: 'build', cols: 100, rows: 30 })

await session.write('npm run dev')
const result = await session.wait({ match: ['ready in'], timeoutMs: 60_000 })
console.log(result.outcome, result.phase)
console.log(result.view.text)

await session.close()
```

Or register the tool definitions with your own model runtime:

```ts
import { createTerminalTools, toolIndex, TerminalRegistry } from 'agent-interactive-terminal'

const registry = new TerminalRegistry()
const tools = toolIndex(createTerminalTools(registry))
// Expose each tool's name, description, and parameters schema to the model,
// then dispatch calls through tools.get(name).execute(args).
```

The eight tools are `terminal_open`, `terminal_send`, `terminal_wait`,
`terminal_snapshot`, `terminal_key`, `terminal_resize`, `terminal_close`, and
`terminal_list`.

### Human in the loop

The lease decides who owns the keyboard. A person can take over at any time; the
agent then gets `LEASE_DENIED` on writes and `human_took_over` from a wait, and
cannot take control back on its own:

```ts
session.takeOver()                     // the person is driving now
await session.write('ls', { origin: 'human' })
session.handBack()                     // the person gives it back
```

When a credential prompt appears, the session suspends the agent, settles the
pending wait with `human_required`, and holds the lease until a person answers:

```ts
const asked = await session.wait({ timeoutMs: 30_000 })
if (asked.outcome === 'human_required') {
  // Show the prompt to the human. Never ask the model for the secret.
  await session.write(secretFromHuman, { origin: 'human' })
}
```

Secrets can be injected at spawn time, so a value never crosses the terminal:

```ts
const session = await sessions.open({
  secrets: { GITHUB_TOKEN: () => readCredential('github') },
})
```

### Browser attach

`npm run attach` starts a local demo that renders the same session in a browser
through xterm.js and a WebSocket. The page is read-only until you press "Take
over"; from then on keystrokes go through `session.write(..., { origin: 'human' })`,
and "Hand back" returns the keyboard to the agent. The demo server binds to
`127.0.0.1`, serves xterm.js from `node_modules`, and has no authentication, so
treat it as an example rather than a deployment.

## What works today

- A real PTY per session, launched from `$SHELL` (or an explicit path), with
  `TERM=xterm-256color`, the working directory, and extra environment entries.
- A headless xterm screen model with alternate-screen handling, scrollback,
  soft-wrap joining, cursor and title tracking, and removal of shell ghost text
  drawn after the cursor in dim cells.
- Two projections from one screen: a text screen for the model and a serialized
  ANSI snapshot for the browser attach stream.
- Phases `starting`, `running`, `waiting_input`, `idle`, and `exited`. Bash gets
  prompt markers installed by a wrapper rcfile; zsh and other shells fall back to
  foreground-process inspection plus a short quiet window.
- A single-writer lease with human takeover and handback, password-prompt
  detection that suspends the agent and settles waits with `human_required`, and
  secret injection at spawn time.
- A browser attach demo that shares one live session with xterm.js, read-only
  until a person takes over.
- A wait engine with literal matches, quiet time, phase settling, and timeout,
  evaluated in a fixed priority order, plus Ctrl-C style interrupts and
  bracketed paste.
- Named keys including interrupt, EOF, suspend, arrows, paging, and common
  Ctrl chords, plus resize and process-tree cleanup on close.
- Twenty-one tests covering the screen model, session lifecycle, lease, secrets,
  and tools.

Not yet implemented: harness-side attach wiring (the demo shows the protocol),
the per-write audit record, redaction spans, wake-on-pattern jobs, native zsh
prompt integration, and Windows parity. See [ROADMAP.md](ROADMAP.md).

## Design at a glance

The design is organised in five layers:

1. **PTY primitives**: spawn, write, resize, signal, foreground process
   inspection, process tree cleanup.
2. **Session core**: one screen model per session, activity tracking, waiters,
   control lease, redaction, audit.
3. **Session service**: identity, publication, authorization, cleanup, and
   change events.
4. **Tool surface**: a small set of model-facing tools that write, wait, read
   the screen, press keys, resize, and close.
5. **Transport and UI**: an attach stream for a browser terminal, sharing the
   same session record as the agent.

Three invariants hold across the layers. There is one screen model and two
projections, text for the agent and serialized ANSI for the browser. Writing is
an action, waiting is a query, and state is a fact, kept separate so a long task
can be observed without being written to. Authority is granted when a session is
created rather than re-approved on every keystroke.

The full design, including tool schemas, data structures, the lease protocol,
and the list of sharp edges, is in [docs/design.zh.md](docs/design.zh.md). The
document is written in Chinese; an English translation is welcome.

## Repository layout

```
src/screen/model.ts    Headless xterm screen model and both projections
src/pty/pty.ts         node-pty wrapper
src/pty/proc.ts        Linux foreground group and stdin-wait inspection
src/session/session.ts TerminalSession: write, wait, key, snapshot, resize, close
src/session/registry.ts Session ids, limits, lookup, and cleanup
src/session/shell.ts   $SHELL resolution and startup-file wrapper
src/tools/index.ts     Eight model-facing tool definitions
src/cli/demo.ts        Interactive demo over the tool surface
test/                  Screen, session, and tool tests
docs/design.zh.md      Full design document
ROADMAP.md             Milestones, scope, and explicit non-goals
```

## Status and roadmap

M1 covers a single agent with a readable screen and waits that settle for the
right reason. M2 adds the shared session, the lease, and password handoff. M3
polishes shell fidelity and multi-session context. [ROADMAP.md](ROADMAP.md) lists
every item and every deliberate non-goal.

## Related work

The design was written against DeepSeek Harness and builds on primitives that
already exist there: a node-pty based terminal spawner, an owner-scoped session
registry, a shell backend with prompt markers, a headless xterm screen, a duplex
attach stream, and a background job channel that can wake an idle agent. The
proposal is to unify those pieces behind one session model rather than to
replace them.

Prior art worth reading includes tmux and screen for session multiplexing,
expect for scripted interaction, and the PTY and terminal emulation work in
libvterm, xterm.js, and pyte.

## Contributing

Issues and design comments are welcome, especially from people who have built
agent tooling or terminal multiplexers. If you want to implement a milestone,
open an issue first so the scope stays aligned with the roadmap.

## License

MIT. See [LICENSE](LICENSE).
