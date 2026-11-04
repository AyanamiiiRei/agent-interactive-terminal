import { describe, expect, it } from 'vitest'
import { apply } from '../src/plugin.js'

interface ToolDefinition {
  name: string
  execute(args: unknown, exec: { agent?: unknown }): Promise<string>
}

interface Harness {
  names(): string[]
  call(name: string, args: unknown): Promise<string>
  close(): Promise<void>
}

/**
 * Mount the plugin with a stand-in tool registry so the config the loader would
 * pass to `apply` is exercised through the real session code.
 *
 * @param config - row configuration handed to the plugin.
 * @returns the registered tools and a disposer.
 */
function mount(config: { shell: 'auto' | 'zsh' | 'bash'; maxSessions: number }): Harness {
  const definitions = new Map<string, ToolDefinition>()
  const disposers: (() => void | Promise<void>)[] = []
  const ctx = {
    tools: {
      register(definition: ToolDefinition): () => void {
        definitions.set(definition.name, definition)
        return () => definitions.delete(definition.name)
      },
    },
    effect(effect: () => (() => void) | void): void {
      const disposer = effect()
      if (disposer !== undefined) disposers.push(disposer)
    },
  }
  apply(ctx as never, config)
  const agent = { id: 'plugin-test-agent' }
  return {
    names() {
      return [...definitions.keys()].sort()
    },
    async call(name, args) {
      const definition = definitions.get(name)
      if (definition === undefined) throw new Error(`tool ${name} was not registered`)
      return definition.execute(args, { agent })
    },
    async close() {
      for (const disposer of disposers.reverse()) await disposer()
    },
  }
}

describe('plugin entry', () => {
  it('registers all eight tools', async () => {
    const harness = mount({ shell: 'auto', maxSessions: 2 })
    try {
      expect(harness.names()).toEqual([
        'terminal_close',
        'terminal_key',
        'terminal_list',
        'terminal_open',
        'terminal_resize',
        'terminal_send',
        'terminal_snapshot',
        'terminal_wait',
      ])
    } finally {
      await harness.close()
    }
  })

  it('opens the shell named by the config instead of $SHELL', async () => {
    const harness = mount({ shell: 'bash', maxSessions: 2 })
    try {
      const opened = await harness.call('terminal_open', { name: 'config-shell' })
      expect(opened).toContain('| bash |')
      const id = /\[session: (s-[0-9a-f]+)\]/.exec(opened)?.[1]
      expect(id).toBeTruthy()
      const echoed = await harness.call('terminal_send', {
        sessionId: id as string,
        text: 'echo $0',
      })
      expect(echoed).toMatch(/\/bash|\/usr\/bin\/bash/)
    } finally {
      await harness.close()
    }
  })

  it('follows $SHELL in auto mode', async () => {
    const previous = process.env['SHELL']
    process.env['SHELL'] = '/bin/bash'
    const harness = mount({ shell: 'auto', maxSessions: 2 })
    try {
      const opened = await harness.call('terminal_open', { name: 'auto-shell' })
      expect(opened).toContain('| bash |')
    } finally {
      await harness.close()
      if (previous === undefined) delete process.env['SHELL']
      else process.env['SHELL'] = previous
    }
  })

  it('applies the configured session limit', async () => {
    const harness = mount({ shell: 'bash', maxSessions: 1 })
    try {
      const opened = await harness.call('terminal_open', { name: 'limit-one' })
      expect(opened).toContain('[session:')
      await expect(harness.call('terminal_open', { name: 'limit-two' })).rejects.toThrow(
        /session limit/,
      )
    } finally {
      await harness.close()
    }
  })
})
