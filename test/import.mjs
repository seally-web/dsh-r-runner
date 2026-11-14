/**
 * Guard: the host half must import with nothing but Node built-ins available.
 *
 * A profile install does not contain `@deepseek-ai/*` and the host does not
 * always provide a resolver for it, so any bare host-package import makes the
 * whole plugin vanish — exactly the dsh 0.2.2 regression that hit the MATLAB
 * runner. This test runs in a plain node process: that barren module graph.
 */
import assert from 'node:assert/strict'

const host = await import('../lib/index.js')
assert.equal(typeof host.apply, 'function', 'host half exports apply')
assert.ok(Array.isArray(host.inject), 'host half exports inject')
assert.deepEqual([...host.inject], ['webServer', 'subprocess', 'workspaceRegistry'])

const client = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../lib/client.js', import.meta.url), 'utf8'))
assert.match(client, /__ModuleLoader__\.load/, 'client half is a module-loader bundle')
assert.doesNotMatch(client, /^\s*import\s/m, 'client half ships pre-bundled (no top-level import)')

const runner = await import('../lib/runner.js')
for (const name of ['RSession', 'defaultConfig', 'readConfig', 'writeConfig', 'normalizeConfig', 'treeEntries', 'fileKind', 'probeR']) {
  assert.ok(runner[name] !== undefined, `runner.js exports ${name}`)
}

console.log('import: ok')
