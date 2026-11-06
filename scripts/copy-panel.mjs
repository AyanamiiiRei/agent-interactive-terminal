/**
 * Copy the panel page into dist so the published MCP server can serve it.
 * TypeScript only compiles .ts files, so the HTML is copied separately.
 *
 * @module scripts/copy-panel
 */
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const from = join(root, 'src/panel/panel.html')
const to = join(root, 'dist/panel/panel.html')
await mkdir(dirname(to), { recursive: true })
await copyFile(from, to)
console.log(`copied ${to}`)
