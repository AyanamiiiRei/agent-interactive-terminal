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
  component?: unknown
}

interface CloseHandler {
  kind: string
  run(sessionId: string, tab: { id: string; navigation?: { params?: Record<string, unknown> } }): void
}

interface Harness {
  inject: string[]
  slots: SlotRegistration[]
  tabs: Record<string, unknown>[]
  opened: { kind: string; options?: Record<string, unknown> }[]
  focused: string[]
  closed: string[]
  closeHandlers: CloseHandler[]
  fetch: ReturnType<typeof vi.fn>
  storage: Map<string, string>
  openTabs: Record<string, unknown>[]
  apply(): void
}

/**
 * Execute the browser half in a sandbox with just enough DOM and React to run
 * the registration code, then return what it registered.
 *
 * Components render as plain descriptors; no DOM is involved.
 *
 * @returns the registered slots, tab types and recorded navigation.
 */
function loadClient(): Harness {
  const source = readFileSync(resolve(process.cwd(), 'client/index.js'), 'utf8')
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ sessions: [] }),
  }))
  const storage = new Map<string, string>()
  const sandbox: Record<string, unknown> = {
    console,
    fetch: (...args: unknown[]) => fetchMock(...args),
  }
  const loaded: { module?: { factory(require: (id: string) => unknown): Record<string, unknown> } } = {}
  sandbox['window'] = {
    location: { protocol: 'http:', host: '127.0.0.1:3080' },
    localStorage: {
      getItem: (key: string) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    __ModuleLoader__: {
      load(module: { factory(require: (id: string) => unknown): Record<string, unknown> }): void {
        loaded.module = module
      },
    },
  }
  sandbox['document'] = {
    querySelector: () => ({}),
    createElement: () => ({ dataset: {}, textContent: '' }),
    head: { appendChild: () => undefined },
  }
  runInNewContext(source, sandbox)

  const reactStub = {
    createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({
      type,
      props: { ...(props as object), children: children.length === 1 ? children[0] : children },
    }),
    lazy: (factory: () => unknown) => ({ lazy: factory }),
    Suspense: 'suspense',
    useState: (value: unknown) => [value, () => undefined],
    useEffect: () => undefined,
    useRef: (value: unknown) => ({ current: value }),
    useCallback: (fn: unknown) => fn,
    useMemo: (factory: () => unknown) => factory(),
  }
  if (loaded.module === undefined) throw new Error('the client half did not call the module loader')
  const exports = loaded.module.factory(() => reactStub)

  const slots: SlotRegistration[] = []
  const tabs: Record<string, unknown>[] = []
  const opened: { kind: string; options?: Record<string, unknown> }[] = []
  const focused: string[] = []
  const closed: string[] = []
  const closeHandlers: CloseHandler[] = []
  const openTabs: Record<string, unknown>[] = []
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
      register(definition: SlotRegistration, component?: unknown): () => void {
        slots.push({ ...definition, component })
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
      openTabs: { getSnapshot: () => openTabs },
      openTab(kind: string, options?: Record<string, unknown>): void {
        opened.push({ kind, ...(options === undefined ? {} : { options }) })
      },
      focus(tabId: string): void {
        focused.push(tabId)
      },
      close(tabId: string): void {
        closed.push(tabId)
      },
      registerCloseHandler(kind: string, run: CloseHandler['run']): () => void {
        closeHandlers.push({ kind, run })
        return () => undefined
      },
    },
    require: {
      async: () => Promise.resolve({ TerminalView: () => null }),
    },
  }
  return {
    inject: (exports as { inject: string[] }).inject,
    slots,
    tabs,
    opened,
    focused,
    closed,
    closeHandlers,
    fetch: fetchMock,
    storage,
    openTabs,
    apply(): void {
      ;(exports as { apply(ctx: unknown): void }).apply(ctx)
    },
  }
}

describe('browser half', () => {
  it('declares the services the seats need', () => {
    const client = loadClient()
    expect(client.inject).toEqual(['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'])
  })

  it('registers one terminal page, its body and title, and the header button', () => {
    const client = loadClient()
    client.apply()
    expect(client.slots.map((slot) => slot.name).sort()).toEqual([
      'conversation.session.header.utilities',
      'plugins.row.config',
      'sidebar.right.pane.tab',
      'sidebar.right.pane.tab.title',
    ])
    expect(client.slots.find((slot) => slot.name === 'plugins.row.config')?.key).toBe(
      'agent-interactive-terminal#ait-terminal',
    )
    expect(client.tabs).toHaveLength(1)
    expect(client.tabs[0]?.['kind']).toBe('agent-terminal')
    expect(client.tabs[0]?.['multiple']).toBe(false)
    // Closing the page must not kill the sessions the agent may still be using.
    expect(client.closeHandlers).toHaveLength(0)
  })

  it('opens the single terminal page from the header button without a terminal id', async () => {
    const client = loadClient()
    client.apply()
    const header = client.slots.find((slot) => slot.name === 'conversation.session.header.utilities')
    ;(header?.inject?.('session-1') as { openTerminal(): void }).openTerminal()
    expect(client.opened).toEqual([{ kind: 'agent-terminal' }])
    // The page polls for sessions itself, so opening it does not fetch first.
    expect(client.fetch).not.toHaveBeenCalled()
  })

  it('renders the panel host for the DSH session that opened the page', () => {
    const client = loadClient()
    client.apply()
    const body = client.slots.find((slot) => slot.name === 'sidebar.right.pane.tab')
    const injected = body?.component as (props: Record<string, unknown>) => {
      props: { children: { props: Record<string, unknown> } }
    }
    const tree = injected(body?.inject?.('session-1') as Record<string, unknown>)
    const panelProps = tree.props.children.props
    expect(panelProps['sessionId']).toBe('session-1')
    expect(panelProps['attachPath']).toBe('/agent-terminal-bridge/attach')
    expect(typeof (panelProps['api'] as Record<string, unknown>)['state']).toBe('function')
    expect(typeof (panelProps['api'] as Record<string, unknown>)['open']).toBe('function')
    expect(typeof (panelProps['api'] as Record<string, unknown>)['close']).toBe('function')
    const labels = panelProps['labels'] as Record<string, string>
    expect(labels['observe']).toBe('state.observe')
    expect(labels['sealed']).toBe('state.sealed')
    expect(labels['newTerminal']).toBe('action.newTerminal')
  })

  it('titles the page without a session number', () => {
    const client = loadClient()
    client.apply()
    const title = client.slots.find((slot) => slot.name === 'sidebar.right.pane.tab.title')
    const rendered = (title?.component as (props: Record<string, unknown>) => { props: { children: unknown[] } })({
      ...(title?.inject?.('session-1') as Record<string, unknown>),
    })
    expect(JSON.stringify(rendered)).toContain('tab.title')
    expect(JSON.stringify(rendered)).not.toContain('terminal')
  })
})
