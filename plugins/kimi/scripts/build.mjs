import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(scriptDir, '..')
const repoRoot = resolve(pluginRoot, '..', '..')
const sourceDist = join(repoRoot, 'dist')
const targetDist = join(pluginRoot, 'dist')
const targetModules = join(pluginRoot, 'node_modules')
const releaseDir = join(pluginRoot, 'release')
const pluginPackage = JSON.parse(await readFile(join(pluginRoot, 'package.json'), 'utf8'))
const sourcePackage = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'))
const repoRequire = createRequire(join(repoRoot, 'package.json'))

const directRuntimePackages = Object.keys(pluginPackage.dependencies ?? {})
const requiredDistFiles = [
  'mcp/cli.js',
  'mcp/server.js',
  'panel/server.js',
  'panel/panel.html',
  'panel/app.bundle.js',
  'pty/pty.js',
  'screen/model.js',
  'session/session.js',
  'tools/index.js',
]

if (!existsSync(sourceDist)) {
  throw new Error(`source dist is missing: ${sourceDist}`)
}
for (const relative of requiredDistFiles) {
  if (!existsSync(join(sourceDist, relative))) {
    throw new Error(`source runtime file is missing: ${join(sourceDist, relative)}`)
  }
}

await rm(targetDist, { recursive: true, force: true })
await cp(sourceDist, targetDist, { recursive: true, dereference: true })
console.log(`copied ${sourceDist} -> ${targetDist}`)

await rm(targetModules, { recursive: true, force: true })
await mkdir(targetModules, { recursive: true })

const copied = new Map()
const queue = [...directRuntimePackages]

while (queue.length > 0) {
  const name = queue.shift()
  if (name === undefined || copied.has(name)) continue
  let packageJsonPath
  try {
    packageJsonPath = repoRequire.resolve(`${name}/package.json`)
  } catch (error) {
    throw new Error(`cannot resolve runtime package ${name}: ${error instanceof Error ? error.message : String(error)}`)
  }

  const source = dirname(packageJsonPath)
  const target = join(targetModules, ...name.split('/'))
  await mkdir(dirname(target), { recursive: true })
  await cp(source, target, { recursive: true, dereference: true })

  const installed = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'))
  copied.set(name, installed.version)
  for (const dependency of Object.keys(installed.dependencies ?? {})) {
    if (!copied.has(dependency)) queue.push(dependency)
  }
}

for (const [name, expected] of Object.entries(pluginPackage.dependencies ?? {})) {
  const actual = copied.get(name)
  if (actual !== expected) {
    throw new Error(`${name} version mismatch: expected ${expected}, installed ${actual}`)
  }
}

const manifest = {
  sourcePackage: {
    name: sourcePackage.name,
    version: sourcePackage.version,
  },
  pluginPackage: {
    name: pluginPackage.name,
    version: pluginPackage.version,
  },
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  packages: Object.fromEntries([...copied.entries()].sort(([left], [right]) => left.localeCompare(right))),
}
await writeFile(join(pluginRoot, 'runtime-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

await mkdir(releaseDir, { recursive: true })
const zipName = `agent-interactive-terminal-kimi-${process.platform}-${process.arch}.zip`
const zipPath = join(releaseDir, zipName)
await rm(zipPath, { force: true })
const zip = spawnSync('zip', ['-qr', zipPath, '.', '-x', 'release/*'], {
  cwd: pluginRoot,
  stdio: 'inherit',
})
if (zip.status !== 0) {
  throw new Error(`zip failed with exit code ${zip.status ?? 'null'}`)
}

console.log(`built ${zipPath}`)
