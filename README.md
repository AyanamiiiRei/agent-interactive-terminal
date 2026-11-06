<h1 align="center">🖥️ Agent Interactive Terminal</h1>

<p align="center">Stateful PTY terminal sessions where an agent and a person share the same screen.</p>

<p align="center">
  🌐 <b>English</b> · <a href="README.zh.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/AyanamiiiRei/agent-interactive-terminal/actions/workflows/ci.yml"><img src="https://github.com/AyanamiiiRei/agent-interactive-terminal/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node"></a>
  <img src="https://img.shields.io/badge/tests-77%20passing-brightgreen" alt="Tests">
  <a href="https://github.com/AyanamiiiRei/agent-interactive-terminal/stargazers"><img src="https://img.shields.io/github/stars/AyanamiiiRei/agent-interactive-terminal?style=social" alt="Stars"></a>
</p>

> One shared terminal core with two host adapters: a DeepSeek Harness bundle and a Codex/ChatGPT MCP App. Eight `terminal_*` tools, a live shared xterm panel, and password handoff that never enters the model context. Seventy-seven tests pass on Linux with Node 20/22; the full design is in [docs/design.zh.md](docs/design.zh.md).

## Why

The usual `exec` tool has no TTY. Programs do not enter interactive mode, long work is invisible, passwords leak into the transcript, and a person cannot share the same shell with the model.

This project turns a terminal into a resource with identity, a screen, a phase, and a lease. The model reads discrete screen snapshots instead of a byte stream; the person can take over, make it read-only, or seal it.

## Install

Requires Node.js 20+ and a C++ toolchain for `node-pty`. In DSH, add this index under Plugins → Discover:

```text
https://raw.githubusercontent.com/AyanamiiiRei/agent-interactive-terminal/main/plugin-market.json
```

Search for `agent-interactive-terminal`, or paste a Git spec under Add plugin. Approve the `node-pty` build script on first install; restart DSH once after upgrading.

```bash
git clone https://github.com/AyanamiiiRei/agent-interactive-terminal.git
cd agent-interactive-terminal
npm install
npm run build
```

### Platforms

Unix shells come first: Linux and macOS use the local zsh/bash; macOS falls back to `/bin/zsh` when `$SHELL` is unset. On Windows the launcher looks for `wsl.exe`: when usable it starts zsh (or bash if zsh is missing) inside WSL and translates the generated rc files to WSL paths. Without WSL it falls back to PowerShell 7, Windows PowerShell, or `cmd.exe`. Choosing zsh/bash without WSL fails with an explicit message. Native PowerShell/cmd has no prompt markers, so waits fall back to screen content and output silence: usable, but less precise than WSL.

## Quick start

```bash
npm run demo -- "git status"   # one command and the model-facing screen
npm run demo                   # interactive loop: /snap, /wait, /key, /resize, /quit
npm run attach                 # browser attach demo, open the printed address
```

## Inside DSH

The terminal icon lives in the session header. Opening it shows an xterm panel on the right; session tabs are numbered in their current order and close on middle click. While the agent is active, the top bar and the area below the terminal carry an RGB running light.

- **Keyboard ownership**: typing takes the lease; a few idle seconds hand it back. Agent writes queue during that window, with the queued command and a cancel button in the top bar, then drain in order after handback.
- **Access levels**: `collaborate`, `observe` (read-only), and `sealed` (no read or write; the list keeps only a redacted record). Read-only and sealed refuse queueing and return distinct errors.
- **Tool policy**: interactive first by default; one-shot first and terminal only are the alternatives. Terminal only hides bash from the agent. A separate switch steers REPL work into python and similar interactive sessions.
- **Settings**: theme, font, cursor, shortcuts, scrollback, bell, copy/paste, and lease timeout. The theme follows DSH by default and can be pinned to a fixed palette.

## Inside Codex

The same core also ships as an MCP stdio server plus a Codex plugin. After building, add the repository to Codex's plugin marketplaces:

```bash
npm install && npm run build
codex plugin marketplace add /path/to/agent-interactive-terminal
codex plugin add agent-interactive-terminal@agent-interactive-terminal
```

Start `codex` and ask it to open a terminal; the `terminal_open` result carries a local panel URL. Open that page to share the shell, take over, make it read-only, seal it, and answer password prompts. See [docs/codex.zh.md](docs/codex.zh.md) for the full walkthrough.

The same terminal can also appear beside the conversation in the ChatGPT desktop app, which ships Codex as its agent. The `interactive_terminal` tool declares a `thread` entrypoint through MCP Extensions; after restarting the desktop app and opening a new Codex chat, choose **Interactive Terminal** in the side panel. The window embeds the same React panel used by the DSH adapter, with the MCP stdio transport adapted to the panel's attach protocol. That panel and Codex's built-in **Terminal** are separate: the built-in one is Codex's own PTY, while Interactive Terminal drives this project's `terminal_*` session, with screen snapshots, waits, a takeover lease, and read-only/sealed access.

Without the plugin marketplace, register the MCP server directly:

```bash
codex mcp add ait -- node /path/to/agent-interactive-terminal/plugins/codex/bin/ait-mcp.mjs
```

The MCP server and panel also run on their own:

```bash
npm run mcp          # or node dist/mcp/cli.js after a build
npm run panel        # standalone panel with a manually opened shell
```

## From code

No agent framework is required; use `TerminalRegistry` directly:

```ts
import { TerminalRegistry } from 'agent-interactive-terminal'

const sessions = new TerminalRegistry({ maxSessions: 2 })
const session = await sessions.open({ name: 'build', cols: 100, rows: 30 })

await session.write('npm run dev')
const result = await session.wait({ match: ['ready in'], timeoutMs: 60_000 })
console.log(result.outcome, result.view.text)

session.takeOver()
await session.write('y', { origin: 'human' })
session.handBack()
await session.close()
```

`createTerminalTools(registry)` exposes the same surface to another model runtime. A password prompt makes `wait` return `human_required` and suspends the agent; answer with `session.write(secret, { origin: 'human' })`, and the secret never reaches the model. The `npm run attach` browser demo binds `127.0.0.1` only and has no authentication; it is an example, not a deployment.

## Tools

| Tool | What it does |
| --- | --- |
| `terminal_open` | Open a session, returning id, status line, and initial screen |
| `terminal_send` | Write text (Enter by default) and wait for a settlement |
| `terminal_wait` | Wait without writing |
| `terminal_snapshot` | Read the screen or output tail, with optional row deltas |
| `terminal_key` | Press a named key such as `ctrl-c`, `enter`, or `page-down` |
| `terminal_resize` | Resize the terminal |
| `terminal_close` | Close the session and its process tree |
| `terminal_list` | List sessions, phases, sizes, and directories |

## Repository layout

One repository, one `main` branch. The session core, tools, and protocol are shared; host-specific code stays in adapters rather than in a long-lived fork.

```
src/screen/        headless xterm screen model
src/pty/           node-pty and foreground inspection
src/session/       sessions, registry, shell launch
src/tools/         the eight tools
src/mcp/           MCP stdio server
src/panel/         standalone panel and the Codex MCP App adapter
client/            DSH browser half and xterm panel
plugins/codex/     Codex plugin manifest and stdio launcher
test/              core, MCP, and panel tests
```

The Codex adapter imports the DSH `TerminalPanel` / `TerminalView` React component and supplies an MCP-backed transport instead of a WebSocket. The GitHub repository is the source of truth for both hosts; a separate branch is only for short-lived experiments, not for maintaining the Codex port.

## Design

One screen, two projections: text for the model and serialized ANSI for the browser. Writing is an action, waiting is a query, and state is a fact; the three stay separate. Authorization is fixed when the session opens and enforced by the server, not by dropping keys in the browser.

## Status

Implemented: screen snapshots, waits, leases, password handoff, secret injection, auditing, zsh/bash integration, the shared panel, and macOS/Windows WSL launch. Not yet implemented: redaction beyond the audit preview, idle session reclamation, and fish integration. See [ROADMAP.md](ROADMAP.md) for the full list and deliberate non-goals.

## License

MIT, see [LICENSE](LICENSE).

<p align="center">If this saves you some time, a ⭐ is the best support.</p>

<p align="center">🌐 <a href="README.zh.md">Read this in Chinese</a></p>
