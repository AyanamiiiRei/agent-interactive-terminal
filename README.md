# Agent Interactive Terminal

Stateful, PTY-backed terminal sessions that an LLM agent and a human can share.

> **Status: design stage.** This repository currently holds the design and the
> roadmap. The implementation will land here in the open, starting with the M1
> milestone in [ROADMAP.md](ROADMAP.md).

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
docs/design.zh.md   Full design document
ROADMAP.md          Milestones, scope, and explicit non-goals
README.md           This file
README.zh.md        Chinese README
```

There is no source code yet. That is intentional: the design was written against
a real codebase, and publishing it first keeps the scope honest.

## Status and roadmap

The first milestone is the screen model and the tool surface, which works for a
single agent without any sharing. The second adds the shared session, the lease,
and password handoff. The third polishes shell fidelity and multi-session
context. [ROADMAP.md](ROADMAP.md) lists every item and every deliberate
non-goal.

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
