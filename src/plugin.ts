/**
 * DeepSeek Harness plugin entry.
 *
 * The package doubles as a bundle: `cordis.patch.yml` inserts one loader row
 * named `agent-interactive-terminal`, and that row calls this module's
 * `apply(ctx, config)`. Tools are registered globally, but each agent gets its
 * own session registry so one agent cannot read or drive another agent's
 * terminal sessions.
 *
 * @module agent-interactive-terminal/plugin
 */
import z from '@deepseek-ai/schemastery'
import { accessSync, constants } from 'node:fs'
import { join } from 'node:path'
import { createAttachUpgrade } from './attach.js'
import { createBridgeHandler } from './bridge.js'
import { TerminalRegistry } from './session/registry.js'
import { createTerminalTools } from './tools/index.js'
import type { TerminalTool } from './tools/index.js'
import type { RegistryOptions } from './session/registry.js'
import type { BridgeDeps } from './bridge.js'

export const name = 'agent-interactive-terminal'
export const inject = ['tools']

/** Shell, capacity and default execution surface exposed in the Plugins page. */
export const Config = z.object({
  shell: z.union([z.const('auto'), z.const('zsh'), z.const('bash')]).default('auto'),
  maxSessions: z.number().step(1).min(1).max(16).default(4),
  mode: z.union([z.const('auto'), z.const('terminal'), z.const('exec')]).default('auto'),
})

/** Resolved configuration the loader passes to {@link apply}. */
export interface TerminalPluginConfig {
  /** `auto` follows `$SHELL`; `zsh` and `bash` search `PATH` for that shell. */
  shell: 'auto' | 'zsh' | 'bash'
  /** Concurrent sessions one agent may keep open. */
  maxSessions: number
  /**
   * Which execution surface the agent should reach for first. `auto` leaves
   * the choice to the model, `terminal` nudges it toward the shared
   * interactive terminal, and `exec` nudges it back toward one-shot commands.
   */
  mode: 'auto' | 'terminal' | 'exec'
}

interface TextBlock {
  type: 'text'
  text: string
}

interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: Record<string, unknown>
    render(args: unknown, value: string): TextBlock[]
  }
  execute(args: unknown, exec: { agent?: unknown }): Promise<string>
}

interface ToolInstance {
  registry: TerminalRegistry
  tools: Map<string, TerminalTool>
}

interface PluginContext {
  tools: { register(definition: ToolDefinition): () => void }
  effect(effect: () => (() => void) | void): void
  /**
   * Mount an optional feature only when every named service is present.
   * @param services - service names to wait for.
   * @param setup - receives the context carrying those services.
   */
  inject<Host extends object>(services: string[], setup: (scoped: Host & { effect(effect: () => (() => void) | void): void }) => void): void
}

/** The services the loopback bridge uses. */
interface BridgeHost {
  agents: { get(id: string): object | undefined }
  webServer: {
    register(route: {
      kind: 'prefix'
      path: string
      handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>
    }): () => void
    registerUpgrade(route: {
      path: string
      handler: (req: import('node:http').IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => void
    }): () => void
  }
}

/** The services the execution-surface guidance section uses. */
interface PromptHost {
  systemPrompt: {
    getSectionOrder(name: string): number
    section(section: { name: string; order: number; text: string }): () => void
  }
}

/**
 * Locate an executable on `PATH` without spawning a process.
 *
 * @param file - bare program name such as `zsh`.
 * @returns the absolute path, or undefined when no entry is executable.
 */
function findOnPath(file: string): string | undefined {
  const path = process.env['PATH'] ?? ''
  for (const directory of path.split(':')) {
    if (directory.length === 0) continue
    const candidate = join(directory, file)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // Not here; keep looking.
    }
  }
  return undefined
}

/**
 * Resolve the configured shell choice to a spawnable path.
 *
 * @param choice - configured shell selection.
 * @returns a path, or undefined so the session follows `$SHELL`.
 * @throws when a requested shell is not installed.
 */
function shellPath(choice: TerminalPluginConfig['shell']): string | undefined {
  if (choice === 'auto') return undefined
  const found = findOnPath(choice)
  if (found === undefined) {
    throw new Error(`the configured shell "${choice}" is not on PATH`)
  }
  return found
}

/**
 * Mount the terminal tools and manage their per-agent registries.
 *
 * @param ctx - plugin context with the tool registry.
 * @param config - validated row configuration.
 */
export function apply(ctx: PluginContext, config: TerminalPluginConfig): void {
  const options: RegistryOptions = { maxSessions: config.maxSessions }
  const registries: TerminalRegistry[] = []
  const perAgent = new WeakMap<object, ToolInstance>()
  let shared: ToolInstance | undefined

  const create = (): ToolInstance => {
    const registry = new TerminalRegistry(options)
    registries.push(registry)
    return {
      registry,
      tools: new Map(createTerminalTools(registry).map((tool) => [tool.name, tool])),
    }
  }

  const toolkitFor = (agent: unknown): ToolInstance => {
    if (typeof agent === 'object' && agent !== null) {
      let instance = perAgent.get(agent)
      if (instance === undefined) {
        instance = create()
        perAgent.set(agent, instance)
      }
      return instance
    }
    shared ??= create()
    return shared
  }

  const templates = createTerminalTools(new TerminalRegistry(options))
  for (const template of templates) {
    ctx.effect(() =>
      ctx.tools.register({
        name: template.name,
        description: template.description,
        parameters: template.parameters as unknown as Record<string, unknown>,
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute(args, exec) {
          const toolkit = toolkitFor(exec.agent)
          const tool = toolkit.tools.get(template.name)
          if (tool === undefined) throw new Error(`unknown tool ${template.name}`)
          const input = { ...(args as Record<string, unknown>) }
          if (template.name === 'terminal_open' && input['shell'] === undefined) {
            const configured = shellPath(config.shell)
            if (configured !== undefined) input['shell'] = configured
          }
          const result = await tool.execute(input)
          return result.text
        },
      }),
    )
  }

  const openFromBridge = async (
    toolkit: ToolInstance,
    options: { cols?: number; rows?: number; kind?: 'agent' | 'user' },
  ) => {
    const configured = shellPath(config.shell)
    return toolkit.registry.open({
      ...(options.cols === undefined ? {} : { cols: options.cols }),
      ...(options.rows === undefined ? {} : { rows: options.rows }),
      ...(options.kind === undefined ? {} : { kind: options.kind }),
      ...(configured === undefined ? {} : { shell: configured }),
    })
  }

  ctx.inject<BridgeHost>(['webServer', 'agents'], (host) => {
    const resolve: BridgeDeps['resolve'] = (sessionId) => {
      const agent = host.agents.get(sessionId)
      if (agent === undefined) return undefined
      const toolkit = toolkitFor(agent)
      return {
        registry: toolkit.registry,
        open: (options) => openFromBridge(toolkit, options),
      }
    }
    const handler = createBridgeHandler({ resolve })
    const attach = createAttachUpgrade({ resolve })
    host.effect(() => {
      const disposeBridge = host.webServer.register({
        kind: 'prefix',
        path: '/agent-terminal-bridge',
        handler,
      })
      const disposeAttach = host.webServer.registerUpgrade({
        path: '/agent-terminal-bridge/attach',
        handler: attach.handler,
      })
      return () => {
        disposeAttach()
        disposeBridge()
        attach.dispose()
      }
    })
  })

  const modeGuidance =
    config.mode === 'terminal'
      ? 'Prefer terminal_open and the other terminal_* tools when work is interactive, long-running, or benefits from shared state: REPLs, package managers, database clients, TUI programs, or anything that may prompt for input. Keep bash for short one-shot commands whose output you only need once.'
      : config.mode === 'exec'
        ? 'Prefer bash for shell work. Use terminal_open and the other terminal_* tools only when a program needs a persistent interactive session, prompts for input, or should be shared with the user in the right sidebar.'
        : 'Use the interactive terminal when a program needs a persistent session, prompts for input, or the user should watch it; use bash for short one-shot commands whose output you only need once.'

  ctx.inject<PromptHost>(['systemPrompt'], (host) => {
    host.effect(() =>
      host.systemPrompt.section({
        name: 'agent-interactive-terminal',
        order: host.systemPrompt.getSectionOrder('TOOL_PTY'),
        text: [
          modeGuidance,
          'Terminal rules:',
          '- The user can watch and type into every session in the right sidebar, so treat it as a shared workspace and close sessions you no longer need.',
          '- Before each terminal_send or terminal_key that submits something, write one short sentence in the conversation saying what you are about to run; when a command asks Y or N, say which answer you are giving. Do not narrate every line of output.',
          '- For privileges in an interactive terminal use sudo, never pkexec. When a password prompt is visible the terminal suspends your control so the user can type the password; do not try to type it yourself.',
          '- Package-manager upgrades, builds and large downloads can take many minutes. Start them, then leave them alone and tell the user you will report back. Check at most once every five minutes, and never interrupt a slow or quiet command just because it is taking long.',
        ].join('\n'),
      }),
    )
  })

  ctx.effect(() => () => {
    for (const registry of registries) void registry.closeAll()
  })
}

export * from './index.js'
