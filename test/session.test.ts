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
})
