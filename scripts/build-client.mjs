/**
 * Build `client/client.terminal.js`, the lazily loaded xterm chunk.
 *
 * The client half is served as plain files by dsh-client-modules, so the chunk
 * has to be bundled ahead of time and wrapped in the module-loader envelope.
 * react stays external: the factory's `require` resolves it to the Host's one
 * copy, so hooks and context stay on the same instance.
 *
 * @module scripts/build-client
 */
import { build } from 'esbuild'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const entry = join(root, 'client/terminal.src.js')
const output = join(root, 'client/client.terminal.js')

const result = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: ['react', 'react/jsx-runtime'],
  loader: { '.css': 'text' },
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
})

const code = result.outputFiles[0].text
const wrapped = [
  'window.__ModuleLoader__.load({',
  "  id: 'agent-interactive-terminal',",
  "  chunk: 'client.terminal.js',",
  '  factory: (require) => {',
  '    var module = { exports: {} };',
  '    var exports = module.exports;',
  code,
  '    return module.exports;',
  '  },',
  '})',
  '',
].join('\n')

await writeFile(output, wrapped)
console.log(`built ${output} (${wrapped.length} bytes)`)
