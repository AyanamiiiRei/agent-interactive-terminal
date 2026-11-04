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
import { TerminalRegistry } from './session/registry.js'
import { createTerminalTools } from './tools/index.js'
import type { TerminalTool } from './tools/index.js'
import type { RegistryOptions } from './session/registry.js'

export const name = 'agent-interactive-terminal'
export const inject = ['tools']

/** Shell selection exposed in the Plugins page and validated by the loader. */
export const Config = z.object({
  shell: z.union([z.const('auto'), z.const('zsh'), z.const('bash')]).default('auto'),
  maxSessions: z.number().step(1).min(1).max(16).default(4),
})

/** Resolved configuration the loader passes to {@link apply}. */
export interface TerminalPluginConfig {
  /** `auto` follows `$SHELL`; `zsh` and `bash` search `PATH` for that shell. */
  shell: 'auto' | 'zsh' | 'bash'
  /** Concurrent sessions one agent may keep open. */
  maxSessions: number
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

  ctx.effect(() => () => {
    for (const registry of registries) void registry.closeAll()
  })
}

export * from './index.js'
