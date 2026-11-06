import { afterEach, describe, expect, it } from 'vitest'
import { TerminalSession } from '../src/session/session.js'

const sessions: TerminalSession[] = []

async function open(): Promise<TerminalSession> {
  const session = await TerminalSession.open({ id: `s-${sessions.length}`, cols: 80, rows: 24, shell: '/bin/bash' })
  sessions.push(session)
  return session
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()))
})

describe('TerminalSession', () => {
  it('runs a command and settles at the shell prompt', async () => {
    const session = await open()
    expect(session.phase).toBe('idle')
    await session.write('echo hello-test')
    const result = await session.wait({ timeoutMs: 10_000 })
    expect(result.outcome).toBe('settled')
    expect(result.phase).toBe('idle')
    expect(result.view.text).toContain('hello-test')
  })

  it('records agent activity before a line is submitted', async () => {
    const session = await open()
    expect(session.agentAt).toBe(0)
    await session.write('echo partial', { submit: false })
    expect(session.agentAt).toBeGreaterThan(0)
    // Only a submitted line becomes a command; the sweep follows the keystrokes.
    expect(session.agentCommandAt).toBe(0)
    await session.press('ctrl-c')
    const before = session.agentAt
    await session.press('ctrl-c')
    expect(session.agentAt).toBeGreaterThanOrEqual(before)
  })

  it('waits for a literal pattern', async () => {
    const session = await open()
    await session.write('printf "ready-TOKEN-42\\n"')
    const result = await session.wait({ match: ['ready-TOKEN-42'], timeoutMs: 10_000 })
    expect(result.outcome).toBe('matched')
    expect(result.view.text).toContain('ready-TOKEN-42')
  })

  it('reports a running command and interrupts it', async () => {
    const session = await open()
    await session.write('sleep 30')
    const running = await session.wait({ quietMs: 400, timeoutMs: 5000 })
    expect(running.phase).toBe('running')
    expect(['quiet', 'timeout']).toContain(running.outcome)

    await session.press('ctrl-c')
    const stopped = await session.wait({ timeoutMs: 5000 })
    expect(stopped.phase).toBe('idle')
  })

  it('enters a decision prompt and answers it', async () => {
    const session = await open()
    await session.write('read -r -p "Continue? [y/N] " answer')
    const asked = await session.wait({ match: ['Continue?'], timeoutMs: 8000 })
    expect(asked.outcome).toBe('matched')
    expect(asked.view.text).toContain('Continue?')
    // A shell builtin blocks inside the shell process, so once output goes
    // quiet the session is treated as sitting at a prompt.
    const atPrompt = await session.wait({ settleOn: ['idle'], timeoutMs: 4000 })
    expect(atPrompt.phase).toBe('idle')
    await session.write('y')
    const answered = await session.wait({ timeoutMs: 8000 })
    expect(answered.view.text).toContain('Continue?')
  })

  it('resizes without losing the screen', async () => {
    const session = await open()
    await session.write('echo resize-check')
    await session.wait({ timeoutMs: 8000 })
    session.resize(60, 20)
    expect(session.size).toEqual({ cols: 60, rows: 20 })
    const snapshot = session.snapshot({ mode: 'screen' })
    expect(snapshot.view.text).toContain('resize-check')
  })

  it('survives a full-screen program and returns to the prompt', async () => {
    const session = await open()
    await session.write('printf "a\\nb\\nc\\n" | less')
    await session.wait({ match: ['(END)'], timeoutMs: 8000 })
    expect(session.snapshot().alt).toBe(true)
    await session.write('q', { submit: false })
    await session.wait({ settleOn: ['idle'], timeoutMs: 8000 })
    expect(session.snapshot().alt).toBe(false)
    expect(session.phase).toBe('idle')
  })

  it('queues an agent command while a person holds the keyboard', async () => {
    const session = await open()
    session.takeOver()
    const outcome = await session.write('echo queued-demo')
    expect(outcome.queued).toBe(true)
    expect(session.pending).toHaveLength(1)
    expect(session.pending[0]?.command).toContain('echo queued-demo')

    session.handBack()
    const result = await session.wait({ match: ['queued-demo'], timeoutMs: 10_000 })
    expect(result.view.text).toContain('queued-demo')
    expect(session.pending).toHaveLength(0)
  })

  it('lets a person cancel a queued agent command', async () => {
    const session = await open()
    session.takeOver()
    const outcome = await session.write('echo canceled-demo')
    expect(outcome.queued).toBe(true)
    expect(session.cancelPending(outcome.pendingId)).toBe(1)
    expect(session.pending).toHaveLength(0)
    expect(session.canceledPending?.command).toContain('echo canceled-demo')

    session.handBack()
    await session.wait({ quietMs: 200, timeoutMs: 2000 })
    expect(session.snapshot().view.text).not.toContain('canceled-demo')
  })

  it('keeps read-only and sealed distinct for the agent', async () => {
    const session = await open()
    session.setAgentAccess('observe')
    await expect(session.write('echo no-write')).rejects.toThrow(/read-only/i)
    session.setAgentAccess('sealed')
    await expect(session.write('echo no-write')).rejects.toThrow(/sealed/i)
    expect(() => session.snapshot()).toThrow(/sealed/i)
  })
})
