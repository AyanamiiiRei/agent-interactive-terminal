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

interface MountOptions {
  shell: 'auto' | 'zsh' | 'bash'
  maxSessions: number
  mode?: 'auto' | 'terminal' | 'exec'
}

/**
 * Mount the plugin with a stand-in tool registry so the config the loader would
 * pass to `apply` is exercised through the real session code.
 *
 * The fake context has no Host web server or prompt service, so the optional
 * seats are skipped exactly as they would be in a deployment without them.
 *
 * @param config - row configuration handed to the plugin.
 * @returns the registered tools and a disposer.
 */
function mount(config: MountOptions): Harness {
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
    inject(): void {
      // The optional Host seats need services this fake context does not mount.
    },
  }
  apply(ctx as never, { ...config, mode: config.mode ?? 'auto' })
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
      const id = /\[session: (\d+)\]/.exec(opened)?.[1]
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

  it('always adds the terminal rules and the mode-specific guidance', () => {
    const sections: { name: string; order: number; text: string }[] = []
    const ctx = {
      tools: { register: () => () => {} },
      effect(effect: () => (() => void) | void): void {
        effect()
      },
      inject(services: string[], setup: (scoped: unknown) => void): void {
        if (!services.includes('systemPrompt')) return
        setup({
          effect(effect: () => (() => void) | void): void {
            effect()
          },
          systemPrompt: {
            getSectionOrder: () => 1700,
            section(section: { name: string; order: number; text: string }): () => void {
              sections.push(section)
              return () => {}
            },
          },
        })
      },
    }
    apply(ctx as never, { shell: 'auto', maxSessions: 1, mode: 'terminal' })
    expect(sections).toHaveLength(1)
    expect(sections[0]?.text).toContain('terminal_open')

    sections.length = 0
    apply(ctx as never, { shell: 'auto', maxSessions: 1, mode: 'auto' })
    expect(sections).toHaveLength(1)
    expect(sections[0]?.text).toContain('Terminal rules')
    expect(sections[0]?.text).toContain('never pkexec')
  })
})
