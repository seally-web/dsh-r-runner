/**
 * Pure host-side helpers: config normalization, path policy, file kinds, tree
 * listing. No R process is started here.
 *   node test/host-unit.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  appendHistory,
  clearHistory,
  readHistory,
  allowedRoots,
  defaultConfig,
  effectiveScriptDir,
  effectiveWorkdir,
  fileKind,
  isAllowedPath,
  listRFiles,
  normalizeConfig,
  treeEntries,
} from '../lib/runner.js'

const dir = mkdtempSync(join(tmpdir(), 'dsh-r-runner-unit-'))
try {
  const nested = join(dir, 'analysis')
  mkdirSync(nested, { recursive: true })
  writeFileSync(join(nested, 'clean.R'), 'x <- 1\n')
  writeFileSync(join(nested, 'report.Rmd'), '---\ntitle: t\n---\n')
  writeFileSync(join(nested, 'notes.txt'), 'hello\n')
  writeFileSync(join(dir, 'plot.png'), 'not really a png')

  const base = normalizeConfig({ ...defaultConfig(), workdir: dir })

  // defaults ------------------------------------------------------------
  assert.equal(base.plotWidth, 960)
  assert.equal(base.plotHeight, 640)
  assert.equal(base.plotRes, 110)
  assert.equal(base.timeoutMs, 600000)
  assert.equal(base.autoSave, true)
  assert.equal(base.runInFileDir, true)
  assert.deepEqual(base.extraRoots, [])
  assert.equal(base.workdir, dir)

  // --vanilla style args are accepted as a string or an array ------------
  assert.deepEqual(normalizeConfig({ sessionArgs: '--vanilla --no-save' }).sessionArgs, ['--vanilla', '--no-save'])
  assert.deepEqual(normalizeConfig({ sessionArgs: ['--vanilla'] }).sessionArgs, ['--vanilla'])

  // a workdir that does not exist still runs somewhere real ---------------
  const missing = normalizeConfig({ workdir: join(dir, 'nope') })
  assert.equal(effectiveWorkdir(missing), process.cwd(), 'a missing folder falls back to the host cwd')

  // scriptDir defaults inside the workdir --------------------------------
  assert.equal(effectiveScriptDir(base), join(dir, 'R'))
  assert.equal(effectiveWorkdir(base), dir)

  // path policy ---------------------------------------------------------
  assert.deepEqual(allowedRoots(base), [dir, join(dir, 'R')])
  assert.equal(isAllowedPath(base, join(nested, 'clean.R')), true)
  assert.equal(isAllowedPath(base, '/etc/passwd'), false)
  assert.equal(isAllowedPath(base, join(nested, 'clean.R'), [nested]), true)
  assert.equal(isAllowedPath(base, join(dir, 'other', 'x.txt')), true, 'anything under the workdir is allowed')
  assert.equal(isAllowedPath(base, '/tmp/elsewhere/script.R'), false, 'a path outside every root is refused')
  const other = mkdtempSync(join(tmpdir(), 'dsh-r-runner-extra-'))
  try {
    assert.equal(isAllowedPath(base, join(other, 'x.R'), [other]), true, 'extra roots widen the policy')
    assert.equal(isAllowedPath(base, join(other, 'x.R')), false)
  } finally {
    rmSync(other, { recursive: true, force: true })
  }

  // file kinds ----------------------------------------------------------
  assert.equal(fileKind('/a/b/clean.R'), 'r')
  assert.equal(fileKind('/a/b/report.Rmd'), 'rmd')
  assert.equal(fileKind('/a/b/.Rprofile'), 'r')
  assert.equal(fileKind('/a/b/notes.txt'), 'text')
  assert.equal(fileKind('/a/b/plot.png'), 'binary')
  assert.equal(fileKind('/a/b/Makefile'), 'other')

  // tree ----------------------------------------------------------------
  const rows = treeEntries(dir)
  assert.ok(rows.length > 0)
  assert.equal(rows[0].dir, true, 'directories sort first')
  assert.ok(rows.some((row) => row.name === 'analysis' && row.dir === true))
  assert.ok(rows.every((row) => !row.name.startsWith('.')))

  // listRFiles walks nested folders and only keeps R sources -------------
  const files = listRFiles(dir)
  assert.deepEqual(files.map((file) => file.name).sort(), ['clean.R', 'report.Rmd'])

  // history: newest first, consecutive duplicates collapsed, clearable ----
  const home = join(dir, '.dsh-home')
  mkdirSync(home, { recursive: true })
  assert.deepEqual(readHistory(home), [])
  appendHistory({ code: '1 + 1', ok: true, ms: 3 }, home)
  appendHistory({ code: '1 + 1', ok: true, ms: 4 }, home)
  appendHistory({ code: 'df <- iris', ok: true, ms: 9 }, home)
  const entries = readHistory(home)
  assert.equal(entries.length, 2, 'consecutive duplicates collapse')
  assert.equal(entries[0].code, 'df <- iris', 'newest first')
  assert.equal(entries[1].ms, 4, 'the newest run of a duplicated command wins')
  assert.equal(appendHistory({ code: '   ' }, home).length, 2, 'blank code is ignored')
  clearHistory(home)
  assert.deepEqual(readHistory(home), [])

  console.log('host-unit: ok')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
