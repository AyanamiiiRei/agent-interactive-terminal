# Roadmap

This roadmap is ordered by dependency, not by importance. Shared sessions only
make sense once the agent and the browser render the same screen from the same
model, so the screen model comes first.

## M1: A session the agent can actually read

The goal is a single-agent terminal that behaves like a terminal, with a screen
the model can reason about and waits that settle for the right reason.

**Status: mostly done.** The unchecked items are the ones that need the shared
session service from M2 or a wake channel from the harness.

- [x] Screen model built on a headless emulator: alternate screen, scrollback,
      soft-wrap joining, cursor, title.
- [x] Text projection with a stable status line: shell, cwd, size, alt-screen
      flag, lease, phase, revision, quiet time.
- [x] Differential snapshots: return only changed rows when the screen is
      mostly stable, and mark reflow after a resize.
- [x] Wait engine with literal matches, quiet time, timeout, and phase settling,
      evaluated in a defined priority order.
- [x] Eight model-facing tools: open, send, wait, snapshot, key, resize, close,
      list.
- [x] Named keys, including interrupt, EOF, suspend, and arrow navigation.
- [x] Bracketed paste for multi-line input so a script is not executed one line
      at a time.
- [ ] Background watch that settles on a pattern and wakes an idle agent.
      (Needs the harness job wake channel; `terminal_wait` covers the polling
      case for now.)
- [x] Session limits, result caps, and a per-write audit record. Idle
      reclamation is still open.

## M2: One terminal, two writers

The goal is the shared session: the human and the agent operate the same PTY,
and control changes hands deliberately.

- [ ] One global session registry instead of two isolated ones.
- [x] Browser attach to an agent-owned session, read-only until an explicit
      takeover. The standalone demo in `examples/browser` shows the protocol;
      wiring it into a harness transport is still open.
- [x] Single-writer lease with takeover and handback. The per-write audit
      record is still open.
- [x] Password detection that suspends the agent, hands control to the human,
      and settles the pending wait with a human-required outcome.
- [x] Secret injection at spawn time from a credential store, so the value never
      crosses the terminal.
- [ ] Redaction spans for sensitive writes in the agent projection.
- [x] Shell fidelity: follow the user's login shell and load its startup files,
      with prompt markers installed after them rather than overwritten by them.
      Bash uses a wrapper rcfile; other shells fall back to foreground-process
      inspection, and a native zsh `precmd` hook is the next refinement.
- [ ] Risk classification on submitted command lines, with high-risk operations
      routed to the human.

## M3: Fidelity and context

- [x] zsh integration, including ghost-text detection by cell attributes. Bash
      and zsh install markers through wrapper rcfiles; fish and other shells
      still fall back to foreground inspection.
- [x] Per-turn session capsule: two or three lines describing open sessions,
      injected only when state changes.
- [ ] TUI fallback: cursor position and row diffs, with explicit guidance toward
      non-interactive alternatives.
- [ ] Windows parity for keys, alternate screen, and foreground inspection.

## Explicit non-goals

- Driving a terminal the user opened outside the sandbox.
- Live streaming subscription for the model.
- Session survival across a harness restart.
- Cross-agent session sharing.
- Semantic understanding of arbitrary TUI applications.
- Screenshots for multimodal models in the first release.

## How to contribute

Open an issue before starting a milestone item, so the scope stays aligned with
the design document. Design changes should update `docs/design.zh.md` in the same
pull request as the code, because the document is the reference for every
interface in this project.
