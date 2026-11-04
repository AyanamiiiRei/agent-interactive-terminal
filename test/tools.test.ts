import { afterAll, describe, expect, it } from 'vitest'
import { TerminalRegistry } from '../src/session/registry.js'
import { createTerminalTools, toolIndex } from '../src/tools/index.js'

const registry = new TerminalRegistry({ maxSessions: 2 })
const tools = toolIndex(createTerminalTools(registry))

afterAll(async () => {
  await registry.closeAll()
})

describe('tools', () => {
  it('runs the open, send, snapshot, list, and close cycle', async () => {
    const open = await tools.get('terminal_open')!.execute({ name: 'tool-test', shell: '/bin/bash' })
    const id = /\[session: (s-[0-9a-f]+)\]/.exec(open.text)?.[1]
    expect(id).toBeTruthy()

    const send = await tools
      .get('terminal_send')!
      .execute({ sessionId: id as string, text: 'echo tool-hello' })
    expect(send.text).toContain('tool-hello')
    expect(send.text).toContain('[wait: settled]')

    const snapshot = await tools
      .get('terminal_snapshot')!
      .execute({ sessionId: id as string, view: 'screen' })
    expect(snapshot.text).toContain('tool-hello')

    const list = await tools.get('terminal_list')!.execute({})
    expect(list.text).toContain(id as string)

    const closed = await tools.get('terminal_close')!.execute({ sessionId: id as string })
    expect(closed.text).toContain('[closed')
  })

  it('rejects an unknown session id', async () => {
    await expect(
      tools.get('terminal_snapshot')!.execute({ sessionId: 's-nope' }),
    ).rejects.toThrow(/no terminal session/)
  })

  it('enforces the session limit', async () => {
    const first = await tools.get('terminal_open')!.execute({ shell: '/bin/bash' })
    const second = await tools.get('terminal_open')!.execute({ shell: '/bin/bash' })
    expect(first.text).toContain('[session:')
    expect(second.text).toContain('[session:')
    await expect(tools.get('terminal_open')!.execute({ shell: '/bin/bash' })).rejects.toThrow(
      /session limit/,
    )
    await registry.closeAll()
  })
})
