// dsh-r-runner host half: config, the persistent R session, and the file/route
// helpers the panel and the agent tool share.
//
// The session is a real long-lived R process (lib/driver.R) that answers
// newline-delimited JSON over a loopback socket. Keeping it alive is the whole
// point: R starts in ~150 ms, but the objects you built during a session are the
// thing that makes a REPL worth having.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { homedir } from 'node:os'
import { dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const DRIVER_PATH = join(HERE, 'driver.R')

const DEFAULTS = {
  rBinary: '',
  rscriptBinary: '',
  sessionArgs: [],
  workdir: '',
  scriptDir: '',
  extraRoots: [],
  runInFileDir: true,
  autoSave: true,
  plotWidth: 960,
  plotHeight: 640,
  plotRes: 110,
  timeoutMs: 600000,
  maxOutputChars: 400000,
  env: {},
}

const TEXT_EXT = new Set(['.R', '.r', '.Rmd', '.rmd', '.qmd', '.Rprofile', '.Rhistory', '.txt', '.csv', '.tsv', '.md'])
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.svg', '.rds', '.rda', '.rdata', '.zip'])

export function configPath(home = process.env.DSH_HOME || join(homedir(), '.dsh')) {
  return join(home, 'r-runner.json')
}

export function defaultConfig() {
  return { ...DEFAULTS, sessionArgs: [...DEFAULTS.sessionArgs], extraRoots: [] }
}

export function readConfig(home) {
  const path = configPath(home)
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return normalizeConfig({ ...defaultConfig(), ...parsed })
  } catch {
    return defaultConfig()
  }
}

export function writeConfig(partial, home) {
  const path = configPath(home)
  const merged = normalizeConfig({ ...readConfig(home), ...partial })
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(merged, null, 2) + '\n')
  return merged
}

export function historyPath(home = process.env.DSH_HOME || join(homedir(), '.dsh')) {
  return join(home, 'r-runner-history.json')
}

export function readHistory(home) {
  try {
    const parsed = JSON.parse(readFileSync(historyPath(home), 'utf8'))
    return Array.isArray(parsed) ? parsed.filter(entry => entry !== null && typeof entry === 'object') : []
  } catch {
    return []
  }
}

export function appendHistory(entry, home) {
  const previous = readHistory(home)
  const code = String(entry?.code ?? '')
  if (code.trim() === '') return previous
  // collapse consecutive duplicates so pressing Run twice does not spam the list
  const next = [{ ...entry, code, at: entry?.at ?? new Date().toISOString() }, ...previous]
    .filter((item, index, all) => index === 0 || item.code !== all[index - 1].code)
    .slice(0, 250)
  const path = historyPath(home)
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(next, null, 2) + '\n')
  } catch {}
  return next
}

export function clearHistory(home) {
  const path = historyPath(home)
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '[]\n')
  } catch {}
  return []
}

export function normalizeConfig(input) {
  const out = { ...DEFAULTS, ...input }
  out.rBinary = typeof out.rBinary === 'string' ? out.rBinary : ''
  out.rscriptBinary = typeof out.rscriptBinary === 'string' ? out.rscriptBinary : ''
  out.sessionArgs = Array.isArray(out.sessionArgs)
    ? out.sessionArgs.map(String)
    : typeof out.sessionArgs === 'string' && out.sessionArgs.trim() !== ''
      ? out.sessionArgs.trim().split(/\s+/)
      : []
  out.extraRoots = Array.isArray(out.extraRoots)
    ? out.extraRoots.filter(p => typeof p === 'string' && p.trim() !== '').map(p => resolve(p))
    : []
  out.workdir = typeof out.workdir === 'string' ? out.workdir : ''
  out.scriptDir = typeof out.scriptDir === 'string' && out.scriptDir !== '' ? out.scriptDir : ''
  out.runInFileDir = out.runInFileDir !== false
  out.autoSave = out.autoSave !== false
  out.plotWidth = clampInt(out.plotWidth, 320, 4000, DEFAULTS.plotWidth)
  out.plotHeight = clampInt(out.plotHeight, 240, 4000, DEFAULTS.plotHeight)
  out.plotRes = clampInt(out.plotRes, 72, 600, DEFAULTS.plotRes)
  out.timeoutMs = clampInt(out.timeoutMs, 1000, 3_600_000, DEFAULTS.timeoutMs)
  out.maxOutputChars = clampInt(out.maxOutputChars, 10_000, 5_000_000, DEFAULTS.maxOutputChars)
  out.env = out.env !== null && typeof out.env === 'object' ? out.env : {}
  return out
}

function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Where a run should happen when the panel did not name a directory. */
export function effectiveWorkdir(config) {
  if (config.workdir && existsSync(config.workdir)) return config.workdir
  return process.cwd()
}

export function effectiveScriptDir(config) {
  if (config.scriptDir) return config.scriptDir
  return join(effectiveWorkdir(config), 'R')
}


/** Run a one-off `Rscript -e` and collect stdout/stderr (used for installs and knits). */
export function runRscript(config, args, { onData, timeoutMs } = {}) {
  return new Promise((resolvePromise) => {
    const binary = config.rscriptBinary || resolveRBinary({ ...config, rBinary: '' }).replace(/\/R$/, '/Rscript')
    const child = spawn(binary || 'Rscript', args, {
      cwd: effectiveWorkdir(config),
      env: { ...process.env, ...config.env },
    })
    let output = ''
    let errorOutput = ''
    const push = (chunk, into) => {
      if (into === 'out') output += chunk.toString()
      else errorOutput += chunk.toString()
      if (onData) onData(into === 'out' ? 'stdout' : 'stderr', chunk.toString())
    }
    child.stdout.on('data', (chunk) => push(chunk, 'out'))
    child.stderr.on('data', (chunk) => push(chunk, 'err'))
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM') } catch {}
    }, timeoutMs ?? config.timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      resolvePromise({ ok: false, code: -1, stdout: output, stderr: `${errorOutput}${error.message}` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolvePromise({ ok: code === 0, code, stdout: output, stderr: errorOutput })
    })
  })
}

/** install.packages() in its own process so the session stays usable while it runs. */
export async function installPackage(config, name) {
  const clean = String(name ?? '').trim()
  if (!/^[A-Za-z][A-Za-z0-9._]*$/.test(clean)) throw new Error(`invalid package name: ${clean}`)
  const script = [
    'repos <- getOption("repos")',
    'if (is.null(repos) || identical(unname(repos["CRAN"]), "@CRAN@")) repos <- c(CRAN = "https://cloud.r-project.org")',
    `install.packages(${JSON.stringify(clean)}, repos = repos, quiet = FALSE)`,
    `ok <- requireNamespace(${JSON.stringify(clean)}, quietly = TRUE)`,
    'cat("\n__R_RUNNER_RESULT__", if (ok) "installed" else "missing", "\\n")',
  ].join('; ')
  const result = await runRscript(config, ['--vanilla', '-e', script], { timeoutMs: 30 * 60 * 1000 })
  return {
    ok: result.ok && /__R_RUNNER_RESULT__ installed/.test(result.stdout),
    name: clean,
    code: result.code,
    output: `${result.stdout}${result.stderr}`.slice(-20000),
  }
}

/** rmarkdown::render() into a temp dir; the panel shows the HTML it produced. */
export async function renderRmd(config, input) {
  const path = resolve(String(input ?? ''))
  if (!isAllowedPath(config, path)) throw new Error(`path outside the configured roots: ${path}`)
  if (!existsSync(path)) throw new Error(`no such file: ${path}`)
  const outDir = join(effectiveWorkdir(config), '.dsh-r-runner', 'rmd')
  mkdirSync(outDir, { recursive: true })
  const script = [
    `input <- ${JSON.stringify(path)}`,
    `out <- ${JSON.stringify(outDir)}`,
    'if (!requireNamespace("rmarkdown", quietly = TRUE)) stop("rmarkdown is not installed; run install.packages(\\"rmarkdown\\")")',
    'html <- rmarkdown::render(input, output_dir = out, quiet = TRUE)',
    'cat("__R_RUNNER_HTML__", normalizePath(html), "\\n")',
  ].join('; ')
  const result = await runRscript(config, ['--vanilla', '-e', script], { timeoutMs: config.timeoutMs })
  const match = /__R_RUNNER_HTML__ (.+)/.exec(result.stdout)
  if (!result.ok || match === null) {
    return { ok: false, error: `${result.stdout}${result.stderr}`.slice(-8000) || 'render failed' }
  }
  return { ok: true, html: match[1].trim(), dir: outDir }
}

/** Candidate R binaries, most specific first. */
export function resolveRBinary(config) {
  if (config.rBinary) return config.rBinary
  const candidates = [
    '/usr/local/bin/R',
    '/opt/homebrew/bin/R',
    '/Library/Frameworks/R.framework/Resources/bin/R',
    '/usr/bin/R',
    join(homedir(), 'miniconda3/envs/r/bin/R'),
    join(homedir(), 'micromamba/envs/r/bin/R'),
  ]
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return candidate
    } catch {}
  }
  return 'R'
}

export function resolveDriverPath() {
  return DRIVER_PATH
}

/**
 * A one-shot check that the configured R can start and report its version.
 * Used by the panel's Settings page so "R not found" is a fact, not a guess.
 */
export function probeR(config, timeoutMs = 20000) {
  return new Promise((done) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      done(value)
    }
    let child
    try {
      child = spawn(resolveRBinary(config), ['--version'], { env: { ...process.env, ...config.env } })
    } catch (error) {
      finish({ ok: false, error: error instanceof Error ? error.message : String(error) })
      return
    }
    let text = ''
    child.stdout?.on('data', d => { text += d })
    child.stderr?.on('data', d => { text += d })
    child.on('error', error => finish({ ok: false, error: error.message }))
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch {}
      finish({ ok: false, error: 'timed out' })
    }, timeoutMs)
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) finish({ ok: true, version: text.trim().split('\n')[0] ?? '' })
      else finish({ ok: false, error: `exit ${code}: ${text.trim().slice(0, 400)}` })
    })
  })
}

/** A persistent R process behind a request/response socket. */
export class RSession {
  constructor(config) {
    this.config = config
    this.child = null
    this.socket = null
    this.server = null
    this.nextId = 1
    this.pending = new Map()
    this.buffer = ''
    this.plots = []
    this.lastError = null
    this.booting = null
    this.startedAt = 0
  }

  get running() {
    return this.child !== null && this.socket !== null
  }

  async freePort() {
    return await new Promise((done, fail) => {
      const server = net.createServer()
      server.on('error', fail)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        const port = typeof address === 'object' && address !== null ? address.port : 0
        server.close(() => done(port))
      })
    })
  }

  async start() {
    if (this.running) return { ok: true, pid: this.child.pid }
    if (this.booting) return await this.booting
    this.booting = this.#boot().finally(() => { this.booting = null })
    return await this.booting
  }

  async #boot() {
    await this.stop()
    const port = await this.freePort()
    const plotDir = join(this.config.workdir || process.cwd(), '.dsh-r-runner', 'plots')
    mkdirSync(plotDir, { recursive: true })

    const binary = resolveRBinary(this.config)
    const args = ['--slave', '-f', DRIVER_PATH, '--args', String(port), plotDir, ...this.config.sessionArgs]
    const child = spawn(binary, args, {
      cwd: effectiveWorkdir(this.config),
      env: { ...process.env, ...this.config.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child
    let stderr = ''
    child.stderr?.on('data', chunk => { stderr += chunk })
    let exited = false
    child.on('exit', (code, signal) => {
      exited = true
      // A restart replaces `this.child` while the old process is still dying:
      // only the current child may tear down the current socket.
      if (this.child !== child) return
      this.lastError = `R exited (${signal ?? code})${stderr ? `: ${stderr.trim().slice(0, 400)}` : ''}`
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer)
        reject(new Error(this.lastError))
      }
      this.pending.clear()
      this.child = null
      this.socket?.destroy()
      this.socket = null
    })

    const socket = await this.#connect(port, 25000)
    if (socket === null) {
      const reason = this.lastError ?? (stderr.trim() || 'R session did not open its socket')
      try { child.kill('SIGKILL') } catch {}
      this.child = null
      this.lastError = reason
      return { ok: false, error: reason }
    }
    this.socket = socket
    this.startedAt = Date.now()
    socket.setEncoding('utf8')
    socket.on('data', chunk => this.#onData(chunk))
    socket.on('error', () => {})
    socket.on('close', () => { this.socket = null })
    const probe = await this.request({ kind: 'ping' }, 20000)
    return probe.ok ? { ok: true, pid: child.pid, version: probe.r } : { ok: false, error: probe.error ?? 'ping failed' }
  }

  #connect(port, timeoutMs) {
    return new Promise((done) => {
      const deadline = Date.now() + timeoutMs
      const attempt = () => {
        if (this.child === null) return done(null)
        const socket = net.connect({ port, host: '127.0.0.1' })
        socket.once('connect', () => done(socket))
        socket.once('error', () => {
          socket.destroy()
          if (Date.now() > deadline) return done(null)
          setTimeout(attempt, 150)
        })
      }
      attempt()
    })
  }

  #onData(chunk) {
    this.buffer += chunk
    let index
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      if (line === '') continue
      let message
      try {
        message = JSON.parse(line)
      } catch {
        continue
      }
      const entry = this.pending.get(message.id)
      if (entry === undefined) continue
      this.pending.delete(message.id)
      clearTimeout(entry.timer)
      entry.resolve(message)
    }
  }

  request(payload, timeoutMs = this.config.timeoutMs) {
    if (this.socket === null) return Promise.resolve({ ok: false, error: 'R session is not running' })
    const id = `r${this.nextId++}`
    const message = { ...payload, id }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve({ id, ok: false, error: `timed out after ${Math.round(timeoutMs / 1000)} s` })
      }, timeoutMs)
      this.pending.set(id, { resolve, timer })
      try {
        this.socket.write(JSON.stringify(message) + '\n')
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        resolve({ id, ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    })
  }

  async runCode(code, options = {}) {
    const started = Date.now()
    await this.start()
    const payload = {
      kind: 'run',
      code,
      wd: options.wd ?? null,
      echo: options.echo === true,
      options: {
        width: this.config.plotWidth,
        height: this.config.plotHeight,
        res: this.config.plotRes,
      },
    }
    const reply = await this.request(payload, options.timeoutMs ?? this.config.timeoutMs)
    const stdout = clip(reply.stdout, this.config.maxOutputChars)
    const stderr = clip(reply.stderr, this.config.maxOutputChars)
    const plots = Array.isArray(reply.plots)
      ? reply.plots
      : typeof reply.plots === 'string' && reply.plots !== ''
        ? [reply.plots]
        : []
    for (const plot of plots) if (!this.plots.includes(plot)) this.plots.push(plot)
    return {
      ok: reply.ok === true,
      exitCode: reply.ok === true ? 0 : 1,
      stdout,
      stderr,
      error: reply.error ?? null,
      plots,
      ms: Number.isFinite(reply.ms) ? reply.ms : Date.now() - started,
      wd: typeof reply.wd === 'string' ? reply.wd : effectiveWorkdir(this.config),
    }
  }

  async variables() {
    await this.start()
    const reply = await this.request({ kind: 'vars' }, 30000)
    if (reply.ok !== true) return { ok: false, error: reply.error ?? 'could not read variables' }
    return { ok: true, variables: Array.isArray(reply.variables) ? reply.variables : [], wd: reply.wd }
  }

  async assign(name, value) {
    await this.start()
    return await this.request({ kind: 'assign', name, value }, 30000)
  }

  async removeVariable(name) {
    await this.start()
    return await this.request({ kind: 'rm', name }, 30000)
  }

  async help(topic) {
    await this.start()
    return await this.request({ kind: 'help', topic }, 30000)
  }

  async complete(line, limit = 300) {
    await this.start()
    return await this.request({ kind: 'complete', line, limit }, 30000)
  }

  async diagnose(code) {
    await this.start()
    return await this.request({ kind: 'diagnose', code }, 30000)
  }

  async definition(name) {
    await this.start()
    return await this.request({ kind: 'definition', name }, 30000)
  }

  async packages(refresh = false) {
    await this.start()
    return await this.request({ kind: 'packages', refresh }, 60000)
  }

  async data(name, limit = 100) {
    await this.start()
    return await this.request({ kind: 'data', name, limit }, 60000)
  }

  async stop() {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer)
      reject(new Error('session stopped'))
    }
    this.pending.clear()
    const socket = this.socket
    this.socket = null
    if (socket !== null) {
      try { socket.write(JSON.stringify({ kind: 'quit', id: 'quit' }) + '\n') } catch {}
      try { socket.destroy() } catch {}
    }
    const child = this.child
    this.child = null
    if (child !== null) {
      try { child.stdin?.end() } catch {}
      try { child.kill('SIGTERM') } catch {}
      const killer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 4000)
      killer.unref?.()
    }
    return { ok: true }
  }

  status() {
    const config = this.config
    return {
      mode: 'session',
      running: this.running,
      pid: this.child?.pid ?? null,
      uptimeMs: this.running ? Date.now() - this.startedAt : 0,
      rBinary: resolveRBinary(config),
      workdir: effectiveWorkdir(config),
      scriptDir: effectiveScriptDir(config),
      plots: this.plots.slice(-24),
      lastError: this.lastError,
    }
  }
}

function clip(text, max) {
  if (typeof text !== 'string') return ''
  if (text.length <= max) return text
  return text.slice(0, max) + `\n… output clipped at ${max} characters`
}

// ---------------------------------------------------------------- file system

export function isPathInside(child, parent) {
  const rel = resolve(child).slice(resolve(parent).length)
  return resolve(child) === resolve(parent) || rel.startsWith(sep)
}

export function allowedRoots(config) {
  const roots = [effectiveWorkdir(config), effectiveScriptDir(config), ...config.extraRoots]
  return [...new Set(roots.filter(p => typeof p === 'string' && p !== '').map(p => resolve(p)))]
}

export function isAllowedPath(config, path, extraRoots = []) {
  const target = resolve(path)
  for (const root of [...allowedRoots(config), ...extraRoots.map(p => resolve(p))]) {
    if (isPathInside(target, root)) return true
  }
  return false
}

export function treeEntries(dir, { showHidden = false } = {}) {
  const entries = readdirSync(dir, { withFileTypes: true })
  const rows = []
  for (const entry of entries) {
    if (!showHidden && entry.name.startsWith('.')) continue
    if (entry.name === 'node_modules') continue
    const full = join(dir, entry.name)
    let size = 0
    let mtimeMs = 0
    try {
      const stat = statSync(full)
      size = stat.size
      mtimeMs = stat.mtimeMs
    } catch {}
    rows.push({
      name: entry.name,
      path: full,
      dir: entry.isDirectory(),
      size,
      mtimeMs,
    })
  }
  rows.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1))
  return rows
}

export function readTextFile(path) {
  const stat = statSync(path)
  if (stat.size > 4_000_000) throw new Error('file is larger than 4 MB')
  return { text: readFileSync(path, 'utf8'), mtimeMs: stat.mtimeMs, size: stat.size }
}

export function writeTextFile(path, text) {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path, text, 'utf8')
  const stat = statSync(path)
  return { mtimeMs: stat.mtimeMs, size: stat.size }
}

export function fileKind(path) {
  const name = path.split(sep).pop() ?? path
  if (name === '.Rprofile' || name === '.Rhistory') return 'r'
  const ext = extname(name).toLowerCase()
  if (ext === '.r') return 'r'
  if (ext === '.rmd' || ext === '.qmd') return 'rmd'
  if (BINARY_EXT.has(ext)) return 'binary'
  if (TEXT_EXT.has(ext)) return 'text'
  return 'other'
}

export function isAbsolutePath(path) {
  return isAbsolute(path)
}

export function listRFiles(dir, depth = 3) {
  const out = []
  const walk = (current, level) => {
    if (level > depth) return
    let rows
    try {
      rows = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const row of rows) {
      if (row.name.startsWith('.') || row.name === 'node_modules') continue
      const full = join(current, row.name)
      if (row.isDirectory()) walk(full, level + 1)
      else if (fileKind(full) === 'r' || fileKind(full) === 'rmd') out.push({ name: row.name, path: full })
    }
  }
  walk(dir, 0)
  out.sort((a, b) => a.path.localeCompare(b.path))
  return out.slice(0, 400)
}
