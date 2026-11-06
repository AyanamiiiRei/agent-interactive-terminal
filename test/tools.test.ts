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
    const id = /\[session: (\d+)\]/.exec(open.text)?.[1]
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

  it('honours the access level the person set', async () => {
    const open = await tools.get('terminal_open')!.execute({ name: 'access-test', shell: '/bin/bash' })
    const id = /\[session: (\d+)\]/.exec(open.text)?.[1] as string
    const session = registry.require(id)
    try {
      session.setAgentAccess('observe')
      await expect(
        tools.get('terminal_send')!.execute({ sessionId: id, text: 'echo hidden' }),
      ).rejects.toMatchObject({ code: 'READ_ONLY' })
      const snap = await tools.get('terminal_snapshot')!.execute({ sessionId: id })
      expect(snap.text).toContain('| bash |')

      session.setAgentAccess('sealed')
      await expect(
        tools.get('terminal_snapshot')!.execute({ sessionId: id }),
      ).rejects.toMatchObject({ code: 'SEALED' })
      const list = await tools.get('terminal_list')!.execute({})
      expect(list.text).toContain(`${id} sealed`)
      expect(list.text).not.toContain('access-test')
      await expect(
        tools.get('terminal_close')!.execute({ sessionId: id }),
      ).rejects.toMatchObject({ code: 'SEALED' })
    } finally {
      await registry.close(id)
    }
  })

  it('queues a send while a person holds the keyboard', async () => {
    const open = await tools.get('terminal_open')!.execute({ name: 'queue-test', shell: '/bin/bash' })
    const id = /\[session: (\d+)\]/.exec(open.text)?.[1] as string
    const session = registry.require(id)
    try {
      session.takeOver()
      const send = await tools.get('terminal_send')!.execute({ sessionId: id, text: 'echo queued-tool' })
      expect(send.text).toContain('[queued:')
      expect(send.text).toContain('control is held by the user')
      expect(session.pending).toHaveLength(1)
      expect(session.cancelPending(undefined)).toBe(1)
      expect(session.pending).toHaveLength(0)
    } finally {
      session.handBack()
      await registry.close(id)
    }
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
