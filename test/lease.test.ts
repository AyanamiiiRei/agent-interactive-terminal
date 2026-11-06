import { afterEach, describe, expect, it } from 'vitest'
import { TerminalSession } from '../src/session/session.js'

const sessions: TerminalSession[] = []

async function open(): Promise<TerminalSession> {
  const session = await TerminalSession.open({
    id: `s-lease-${sessions.length}`,
    cols: 80,
    rows: 24,
    shell: '/bin/bash',
  })
  sessions.push(session)
  return session
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()))
})

describe('control lease', () => {
  it('queues agent writes while a person holds the keyboard', async () => {
    const session = await open()
    session.takeOver()
    expect(session.lease.holder).toBe('human')
    expect(session.statusLine()).toContain('lease=human')

    const queued = await session.write('echo queued')
    expect(queued.queued).toBe(true)
    expect(session.pending).toHaveLength(1)

    await session.write('echo human-ok', { origin: 'human' })
    const during = await session.wait({ timeoutMs: 5000 })
    expect(during.outcome).toBe('human_took_over')

    session.handBack()
    expect(session.lease.holder).toBe('agent')
    const after = await session.wait({ match: ['queued', 'human-ok'], timeoutMs: 8000 })
    expect(after.outcome).toBe('matched')
    expect(after.view.text).toContain('queued')
    expect(after.view.text).toContain('human-ok')
  })

  it('suspends the agent at a credential prompt', async () => {
    const session = await open()
    await session.write('read -s -p "Enter passphrase: " pw; echo "length=${#pw}"')
    const asked = await session.wait({ timeoutMs: 8000 })
    expect(asked.outcome).toBe('human_required')
    expect(asked.view.text).toContain('Enter passphrase:')
    expect(['running', 'waiting_input']).toContain(asked.phase)
    expect(session.lease.suspended).toBe(true)
    expect(session.statusLine()).toContain('suspended')

    await expect(session.write('guess')).rejects.toMatchObject({ code: 'LEASE_DENIED' })

    await session.write('hunter2', { origin: 'human' })
    const done = await session.wait({ timeoutMs: 8000 })
    expect(done.outcome).toBe('settled')
    expect(done.view.text).toContain('length=7')
    expect(done.view.text).not.toContain('hunter2')
    expect(session.lease.holder).toBe('agent')
  })

  it('resolves a credential prompt when the shell returns to its prompt', async () => {
    const session = await open()
    await session.write('printf "Password:"; true')
    await new Promise((resolve) => setTimeout(resolve, 600))
    const result = await session.wait({ timeoutMs: 5000 })
    expect(['settled', 'human_required']).toContain(result.outcome)
    if (result.outcome === 'human_required') {
      session.handBack()
    }
    expect(session.lease.holder).toBe('agent')
  })
})

describe('access levels', () => {
  it('blocks agent writes in observe and reads in sealed', async () => {
    const session = await open()
    session.setAgentAccess('observe')
    await expect(session.write('echo blocked')).rejects.toMatchObject({ code: 'READ_ONLY' })
    expect(session.snapshot().phase).toBeDefined()

    session.setAgentAccess('sealed')
    let error: unknown
    try {
      session.snapshot()
    } catch (caught) {
      error = caught
    }
    expect((error as { code?: string }).code).toBe('SEALED')
  })

  it('aborts a pending agent wait when the person seals the session', async () => {
    const session = await open()
    await session.write('sleep 5')
    const pending = session.wait({ timeoutMs: 10_000 })
    session.setAgentAccess('sealed')
    await expect(pending).rejects.toMatchObject({ code: 'SEALED' })
  })
})

describe('secret injection', () => {
  it('passes a resolved secret to the environment without exposing it', async () => {
    const session = await TerminalSession.open({
      id: 's-secret',
      cols: 80,
      rows: 24,
      shell: '/bin/bash',
      secrets: { AIT_TEST_SECRET: async () => 'swordfish' },
    })
    sessions.push(session)
    await session.write('echo "length=${#AIT_TEST_SECRET}"')
    const result = await session.wait({ timeoutMs: 8000 })
    expect(result.view.text).toContain('length=9')
    expect(result.view.text).not.toContain('swordfish')
    expect(session.statusLine()).not.toContain('swordfish')
  })
})
