/**
 * Interactive demo: drive the session through the same tools the model sees.
 *
 * Usage:
 *   npm run demo                 interactive loop
 *   npm run demo -- "ls -la"     run one command and exit
 */
import { createInterface } from 'node:readline'
import { TerminalRegistry } from '../session/registry.js'
import { createTerminalTools, toolIndex } from '../tools/index.js'

const registry = new TerminalRegistry({ maxSessions: 2 })
const tools = toolIndex(createTerminalTools(registry))
const session = await registry.open({ name: 'demo', cols: 100, rows: 30 })

const oneShot = process.argv.slice(2).join(' ').trim()

function show(text: string): void {
  console.log(text)
  console.log('─'.repeat(60))
}

async function call(name: string, input: Record<string, unknown>): Promise<void> {
  const tool = tools.get(name)
  if (!tool) throw new Error(`unknown tool ${name}`)
  const result = await tool.execute(input)
  show(result.text)
}

if (oneShot.length > 0) {
  await call('terminal_send', { sessionId: session.id, text: oneShot })
  await registry.closeAll()
  process.exit(0)
}

show(session.statusLine())
console.log('Type a command and press Enter. /snap, /wait [ms], /key <name>, /resize <cols> <rows>, /list, /quit.')

const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '› ' })
rl.prompt()

rl.on('line', (line) => {
  void (async () => {
    const input = line.trim()
    try {
      if (input === '/quit') {
        await registry.closeAll()
        rl.close()
        process.exit(0)
      } else if (input === '/snap') {
        await call('terminal_snapshot', { sessionId: session.id })
      } else if (input.startsWith('/wait')) {
        const ms = Number.parseInt(input.split(/\s+/)[1] ?? '5000', 10)
        await call('terminal_wait', { sessionId: session.id, timeoutMs: ms })
      } else if (input.startsWith('/key ')) {
        await call('terminal_key', { sessionId: session.id, key: input.slice(5).trim() })
      } else if (input.startsWith('/resize ')) {
        const [, cols, rows] = input.split(/\s+/)
        await call('terminal_resize', { sessionId: session.id, cols: Number(cols), rows: Number(rows) })
      } else if (input === '/list') {
        await call('terminal_list', {})
      } else if (input.length > 0) {
        await call('terminal_send', { sessionId: session.id, text: input })
      }
    } catch (error) {
      console.error(`error: ${(error as Error).message}`)
    }
    rl.prompt()
  })()
})

rl.on('close', () => {
  void registry.closeAll().then(() => process.exit(0))
})
