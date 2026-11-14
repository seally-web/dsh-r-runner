/**
 * End-to-end driver test: spawn a real R session over the loopback socket and
 * exercise the whole protocol (run, plots, vars, assign, rm, source, restart).
 *   node test/driver.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RSession, defaultConfig, normalizeConfig, probeR, readConfig } from '../lib/runner.js'

const dir = mkdtempSync(join(tmpdir(), 'dsh-r-runner-'))
const session = new RSession(normalizeConfig({ ...defaultConfig(), ...(readConfig?.() ?? {}), workdir: dir }))

try {
  const probe = await probeR(session.config, 30000)
  assert.equal(probe.ok, true, `R probe failed: ${probe.error ?? ''}`)
  console.log(`R ${probe.version ?? "?"}`)

  await session.start()

  const sum = await session.runCode('1 + 1')
  assert.equal(sum.ok, true, JSON.stringify(sum))
  assert.match(sum.stdout, /\[1\] 2/)

  const assign = await session.runCode('x <- 42')
  assert.equal(assign.ok, true)
  assert.equal(assign.stdout, '', 'an assignment prints nothing')

  const vars = await session.variables()
  assert.equal(vars.ok, true)
  const x = vars.variables.find((entry) => entry.name === 'x')
  assert.ok(x, 'x is in the environment')
  assert.equal(x.class, 'numeric')
  assert.equal(x.preview, '42')

  const plot = await session.runCode('plot(1:10, main = "waves")')
  assert.equal(plot.ok, true)
  assert.equal(plot.plots.length, 1, 'one PNG is captured')
  assert.match(plot.plots[0], /\.dsh-r-runner\/plots\/.+\.png$/)

  const edit = await session.assign('x', '7:9')
  assert.equal(edit.ok, true)
  const after = await session.variables()
  assert.equal(after.variables.find((entry) => entry.name === 'x').preview, '7 8 9')

  const script = join(dir, 'count.R')
  writeFileSync(script, 'n <- 3\nprint(n * 2)\n', 'utf8')
  const sourced = await session.runCode(`source(${JSON.stringify(script)})`)
  assert.equal(sourced.ok, true)
  assert.match(sourced.stdout, /\[1\] 6/)

  const failure = await session.runCode('stop("boom")')
  assert.equal(failure.ok, false)
  assert.match(String(failure.error ?? ''), /boom/)

  const frame = await session.runCode('df <- iris[1:5, 1:2]')
  assert.equal(frame.ok, true)
  const preview = await session.data('df')
  assert.equal(preview.ok, true, JSON.stringify(preview))
  assert.deepEqual(preview.columns, ['Sepal.Length', 'Sepal.Width'])
  assert.equal(preview.total, 5)
  assert.equal(preview.rows[0][0], '5.1')
  const notTabular = await session.data('x')
  assert.equal(notTabular.ok, true, 'a bare vector previews as one column')
  assert.equal(notTabular.columns[0], 'value')
  const missing = await session.data('nope')
  assert.equal(missing.ok, false)

  const help = await session.help('mean')
  assert.equal(help.ok, true, JSON.stringify(help))
  assert.match(help.text, /Arithmetic Mean|mean/i)

  const removed = await session.removeVariable('n')
  assert.equal(removed.ok, true)

  const status = session.status()
  assert.equal(status.running, true)
  assert.ok(status.pid > 0)

  await session.stop()
  assert.equal(session.status().running, false)

  // A stopped session restarts cleanly with an empty environment.
  await session.start()
  const fresh = await session.variables()
  assert.deepEqual(fresh.variables, [], 'a restarted session starts empty')

  console.log('driver: ok')
} finally {
  await session.stop()
  rmSync(dir, { recursive: true, force: true })
}
