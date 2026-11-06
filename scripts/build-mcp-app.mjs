/**
 * Build the MCP App iframe bundle used by the ChatGPT/Codex conversation
 * panel. xterm.js, its CSS, and the vendored MCP Apps browser SDK are inlined
 * into one ES module so the host can serve the resource without external
 * requests.
 *
 * @module scripts/build-mcp-app
 */
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const outdir = join(root, 'dist/panel')
await mkdir(outdir, { recursive: true })

await build({
  entryPoints: [join(root, 'src/panel/react-app.js')],
  outfile: join(outdir, 'app.bundle.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  loader: { '.css': 'text' },
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  nodePaths: [join(root, 'node_modules')],
})
console.log(`built ${join(outdir, 'app.bundle.js')}`)
