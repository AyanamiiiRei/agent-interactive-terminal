import { afterEach, describe, expect, it } from 'vitest'
import { TerminalRegistry } from '../src/session/registry.js'

const registry = new TerminalRegistry({ maxSessions: 2 })

afterEach(async () => {
  await registry.closeAll()
})

describe('session capsule', () => {
  it('summarises open sessions and keeps the version stable', async () => {
    const build = await registry.open({ name: 'build', shell: '/bin/bash' })
    const shell = await registry.open({ shell: '/bin/bash' })

    const first = registry.capsule()
    const lines = first.text.split('\n')
    expect(lines).toHaveLength(2)
    expect(first.text).toContain(build.id)
    expect(first.text).toContain('"build"')
    expect(first.text).toContain(shell.id)
    expect(first.text).toContain('idle')
    expect(registry.capsule().version).toBe(first.version)
  })

  it('changes the version when a session changes phase', async () => {
    const session = await registry.open({ shell: '/bin/bash' })
    const before = registry.capsule()
    await session.write('sleep 10')
    await new Promise((resolve) => setTimeout(resolve, 500))
    const during = registry.capsule()
    expect(during.text).toContain('running')
    expect(during.version).not.toBe(before.version)
    await session.press('ctrl-c')
  })

  it('returns an empty capsule when nothing is open', () => {
    const capsule = registry.capsule()
    expect(capsule.text).toBe('')
    expect(capsule.version.length).toBe(12)
  })
})

describe('audit log', () => {
  it('records agent and human writes plus control changes', async () => {
    const session = await registry.open({ shell: '/bin/bash' })
    await session.write('echo audited')
    session.takeOver()
    await session.write('echo human-side', { origin: 'human' })
    session.handBack()

    const entries = session.audit()
    const writes = entries.filter((entry) => entry.kind === 'write')
    expect(writes[0]).toMatchObject({ origin: 'agent', preview: 'echo audited' })
    expect(writes[1]).toMatchObject({ origin: 'human', preview: 'echo human-side' })
    expect(entries.some((entry) => entry.detail === 'takeover')).toBe(true)
    expect(entries.some((entry) => entry.detail === 'handback')).toBe(true)
  })

  it('redacts human input supplied at a secret prompt', async () => {
    const session = await registry.open({ shell: '/bin/bash' })
    await session.write('read -s -p "Enter passphrase: " pw; echo "length=${#pw}"')
    const asked = await session.wait({ timeoutMs: 8000 })
    expect(asked.outcome).toBe('human_required')

    await session.write('hunter2', { origin: 'human' })
    const entries = session.audit()
    const secretWrite = entries.filter((entry) => entry.kind === 'write').at(-1)
    expect(secretWrite?.preview).toBe('')
    expect(secretWrite?.detail).toContain('redacted')
    expect(JSON.stringify(entries)).not.toContain('hunter2')
  })
})
