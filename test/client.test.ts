import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

interface SlotRegistration {
  name: string
  key?: string
  id?: string
  locale?: string
  inject?: (sessionId: string) => Record<string, unknown>
}

interface Harness {
  inject: string[]
  slots: SlotRegistration[]
  tabs: Record<string, unknown>[]
  opened: string[]
  fetch: ReturnType<typeof vi.fn>
  apply(): void
}

/**
 * Execute the browser half in a sandbox with just enough DOM and React to run
 * the registration code, then return what it registered.
 *
 * Components are never rendered, so the React stub only has to exist.
 *
 * @returns the registered slots, tab types and recorded opens.
 */
function loadClient(): Harness {
  const source = readFileSync(resolve(process.cwd(), 'client/index.js'), 'utf8')
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ sessions: [] }),
  }))
  const sandbox: Record<string, unknown> = {
    console,
    fetch: (...args: unknown[]) => fetchMock(...args),
  }
  const loaded: { module?: { factory(require: (id: string) => unknown): Record<string, unknown> } } = {}
  sandbox['window'] = {
    __ModuleLoader__: {
      load(module: { factory(require: (id: string) => unknown): Record<string, unknown> }): void {
        loaded.module = module
      },
    },
  }
  sandbox['document'] = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '' }),
    head: { appendChild: () => undefined },
  }
  runInNewContext(source, sandbox)

  const reactStub = {
    createElement: () => null,
    useState: (value: unknown) => [value, () => undefined],
    useEffect: () => undefined,
    useRef: (value: unknown) => ({ current: value }),
    useCallback: (fn: unknown) => fn,
  }
  if (loaded.module === undefined) throw new Error('the client half did not call the module loader')
  const exports = loaded.module.factory(() => reactStub)

  const slots: SlotRegistration[] = []
  const tabs: Record<string, unknown>[] = []
  const opened: string[] = []
  const ctx = {
    effect(effect: () => unknown): void {
      effect()
    },
    locale: {
      register: () => undefined,
      bind: () => (key: string) => key,
    },
    slots: {
      inject(_name: string, setup: () => unknown): void {
        setup()
      },
      register(definition: SlotRegistration): () => void {
        slots.push(definition)
        return () => undefined
      },
    },
    sidebarRightTabs: {
      register(definition: Record<string, unknown>): () => void {
        tabs.push(definition)
        return () => undefined
      },
    },
    sidebarRight: {
      openTab(kind: string): void {
        opened.push(kind)
      },
    },
  }
  return {
    inject: (exports as { inject: string[] }).inject,
    slots,
    tabs,
    opened,
    fetch: fetchMock,
    apply(): void {
      ;(exports as { apply(ctx: unknown): void }).apply(ctx)
    },
  }
}

describe('browser half', () => {
  it('declares the services the three seats need', () => {
    const client = loadClient()
    expect(client.inject).toEqual(['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'])
  })

  it('registers the config card, the shared tab and the header button', () => {
    const client = loadClient()
    client.apply()
    expect(client.slots.map((slot) => slot.name).sort()).toEqual([
      'conversation.session.header.utilities',
      'plugins.row.config',
      'sidebar.right.pane.tab',
    ])
    expect(client.slots.find((slot) => slot.name === 'plugins.row.config')?.key).toBe(
      'agent-interactive-terminal#ait-terminal',
    )
    expect(client.tabs).toHaveLength(1)
    expect(client.tabs[0]?.['kind']).toBe('agent-terminal')
  })

  it('opens the shared tab from the header button', () => {
    const client = loadClient()
    client.apply()
    const header = client.slots.find((slot) => slot.name === 'conversation.session.header.utilities')
    const props = header?.inject?.('session-1') as { openTerminal(): void }
    props.openTerminal()
    expect(client.opened).toEqual(['agent-terminal'])
  })

  it('binds the bridge calls to the session it was registered for', () => {
    const client = loadClient()
    client.apply()
    const body = client.slots.find((slot) => slot.name === 'sidebar.right.pane.tab')
    const props = body?.inject?.('session-1') as {
      api: { state(): Promise<unknown>; screen(id: string): Promise<unknown>; open(c: number, r: number): Promise<unknown> }
    }
    void props.api.state()
    expect(client.fetch).toHaveBeenCalledWith(
      '/plugins/agent-interactive-terminal/state?sessionId=session-1',
      expect.anything(),
    )
  })
})
