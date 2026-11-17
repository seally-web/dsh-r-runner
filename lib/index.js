/**
 * dsh-r-runner — host half.
 *
 * Registers `/r/api/*` on the web server (panel <-> R) and one agent tool,
 * `r_run`, so the model can execute R code and read the console back.
 *
 * The R process is spawned with `node:child_process` from the host process, so it
 * runs with the system user's permissions — not the agent's sandbox — which is
 * what lets user libraries, `renv`, and home-directory caches work.
 * @module dsh-r-runner
 */
import { readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import {
  RSession,
  installPackage,
  renderQuarto,
  renderRmd,
  startShiny,
  stopShiny,
  defaultConfig,
  findProject,
  effectiveScriptDir,
  effectiveWorkdir,
  fileKind,
  isAllowedPath,
  listRFiles,
  normalizeConfig,
  readConfig,
  readTextFile,
  probeR,
  appendHistory,
  clearHistory,
  readHistory,
  historyPath,
  resolveDriverPath,
  resolveRBinary,
  treeEntries,
  writeConfig,
  writeTextFile,
} from './runner.js'

/** Runtime-identity stand-in for the host's typing helper (see matlab runner). */
const defineTool = (definition) => definition

export const inject = ['webServer', 'subprocess', 'workspaceRegistry']

function failure(error) {
  return { ok: false, error: { message: String(error?.message ?? error) } }
}

async function readJson(request, limit = 8 * 1024 * 1024) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > limit) throw new Error('request body too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  return JSON.parse(text)
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

function suffixOf(url, prefix = '/r/api') {
  const path = (url || '/').split('?')[0]
  const at = path.indexOf(prefix)
  const rest = at === -1 ? path : path.slice(at + prefix.length)
  return rest.replace(/^\/+|\/+$/g, '')
}

function queryParam(url, name) {
  try {
    return new URL(url, 'http://localhost').searchParams.get(name) ?? undefined
  } catch {
    return undefined
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function apply(ctx) {
  const detected = { cwd: undefined, at: 0, source: 'fallback', error: '' }
  const detectTtlMs = () => Number(process.env.DSH_R_RUNNER_DETECT_TTL_MS ?? 120000)

  const registeredRoot = () => {
    try {
      const list = ctx.workspaceRegistry?.list?.() ?? []
      const first = Array.isArray(list) ? list.find(item => typeof item?.path === 'string') : undefined
      return first?.path
    } catch {
      return undefined
    }
  }

  const activate = (candidate) => {
    if (typeof candidate !== 'string' || candidate.trim() === '') return
    const abs = resolve(candidate.trim())
    if (!abs.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(abs)) return
    if (!isDirectory(abs)) {
      detected.error = `workspace not found: ${abs}`
      return
    }
    detected.cwd = abs
    detected.at = Date.now()
    detected.source = 'session'
    detected.error = ''
  }

  const currentWorkspace = () => {
    const fresh = detected.cwd !== undefined && Date.now() - detected.at < detectTtlMs()
    if (fresh) return { cwd: detected.cwd, source: 'session', error: detected.error }
    const root = registeredRoot()
    if (typeof root === 'string' && isDirectory(root)) return { cwd: root, source: 'registry' }
    return { cwd: process.cwd(), source: 'fallback' }
  }

  const configFile = { path: undefined }
  let session = null
  let sessionConfig = null

  const loadConfigResolved = () => {
    const base = readConfig()
    const workspace = currentWorkspace()
    const stored = typeof base.workdir === 'string' && base.workdir !== '' && isDirectory(base.workdir)
    // `autoDetect` (default on) means the panel follows whatever workspace this
    // session is in; a saved workdir only wins when the user turned it off.
    const auto = base.autoDetect !== false
    const workdir = auto || !stored ? workspace.cwd : base.workdir
    const resolved = normalizeConfig({ ...base, workdir })
    return {
      ...resolved,
      detected: workspace,
      storedWorkdir: stored ? base.workdir : '',
      workdirSource: auto ? 'session' : stored ? 'config' : 'session',
    }
  }

  const effectiveConfig = () => {
    const config = loadConfigResolved()
    return config
  }

  const getSession = () => {
    const config = effectiveConfig()
    if (session === null || JSON.stringify(sessionConfig) !== JSON.stringify(config)) {
      if (session !== null) {
        // Config changed under a live session: restart with the new binary/paths.
        const old = session
        old.stop().catch(() => {})
      }
      session = new RSession(config)
      sessionConfig = config
    }
    return session
  }

  const explain = (error) => {
    const message = String(error?.message ?? error)
    if (!/outside the workspace|outside the configured roots|not a directory|not a file|ENOENT/.test(message)) return error
    const workspace = currentWorkspace()
    return new Error(`${message} · current workspace: ${workspace.cwd}`
      + ' (panel → Settings → follow the current workspace)')
  }

  const resolvePath = (raw) => {
    const config = effectiveConfig()
    const value = String(raw ?? '').trim()
    if (value === '') throw new Error('missing path')
    const abs = value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) ? resolve(value) : resolve(config.workdir, value)
    if (!isAllowedPath(config, abs)) throw new Error(`path outside the configured roots: ${abs}`)
    return abs
  }

  const record = (code, result, extra) => {
    try {
      appendHistory({ code, ok: result.ok === true, ms: result.ms ?? null, ...extra })
    } catch {}
    return result
  }

  const runBody = async (body) => {
    const config = effectiveConfig()
    const r = getSession()
    if (typeof body.path === 'string' && body.path.trim() !== '') {
      const path = resolvePath(body.path)
      if (fileKind(path) === 'binary') throw new Error(`cannot run a binary file: ${path}`)
      const source = readTextFile(path)
      const wd = config.runInFileDir ? dirname(path) : config.workdir
      const result = await r.runCode(source.text, { wd })
      record(source.text, result, { file: path })
      return { ...result, scriptPath: path, mode: 'file' }
    }
    const code = typeof body.code === 'string' ? body.code : ''
    if (code.trim() === '') throw new Error('nothing to run')
    const wd = typeof body.wd === 'string' && body.wd !== '' ? body.wd : config.workdir
    const result = await r.runCode(code, { wd })
    record(code, result, {})
    return { ...result, scriptPath: null, mode: 'code' }
  }

  ctx.inject(['tools'], (toolCtx) => {
    toolCtx.effect(() => toolCtx.tools.register(defineTool({
      name: 'r_run',
      description: 'Run R code or a .R/.Rmd file on this machine and return its console output. '
        + 'Pass `code` for an inline snippet or `file` for an existing script (absolute, or relative to the panel\'s '
        + 'R working directory). The plugin keeps one long-lived R session shared with the human user, so objects, '
        + 'loaded libraries and options persist between calls; plots are written to PNG files and returned as paths.',
      parameters: {
        code: { type: 'string', description: 'Inline R source to run.' },
        file: { type: 'string', description: 'Path of an existing .R/.Rmd file to source().' },
        name: { type: 'string', description: 'Optional label used in the run result.' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      timeoutMs: 660000,
      async execute(args) {
        const body = args ?? {}
        const result = await runBody({
          code: body.code,
          path: body.file !== undefined ? resolvePath(body.file) : undefined,
        })
        const parts = [
          `status: ${result.ok ? 'ok' : 'error'}`,
          `exit: ${result.exitCode}`,
          `elapsed: ${Math.round(result.ms)} ms`,
          result.scriptPath !== null ? `script: ${result.scriptPath}` : null,
          result.wd !== undefined ? `workdir: ${result.wd}` : null,
        ].filter(Boolean)
        const console = [result.stdout, result.stderr, result.error].filter(part => part !== null && part !== '').join('\n').trim()
        const plots = result.plots.length > 0 ? `\n--- plots ---\n${result.plots.join('\n')}` : ''
        return `${parts.join(' · ')}\n--- R console ---\n${console === '' ? '(no output)' : console}${plots}`
      },
    })), 'dsh-r-runner: r_run tool')
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/r/api',
    async handler(request, response) {
      const route = suffixOf(request.url)
      activate(queryParam(request.url, 'cwd'))
      try {
        if (request.method === 'GET' && route === 'state') {
          const config = effectiveConfig()
          const project = findProject(config.workdir)
          const sessionNow = getSession()
          const probe = await probeR(config)
          return sendJson(response, 200, {
            ok: true,
            value: {
              ...sessionNow.status(),
              probe,
              config,
              resolvedScriptDir: effectiveScriptDir(config),
              driverPath: resolveDriverPath(),
              defaults: defaultConfig(),
              detected: config.detected,
              project,
            },
          })
        }
        if (request.method === 'GET' && route === 'config') {
          return sendJson(response, 200, { ok: true, value: effectiveConfig() })
        }
        if (request.method === 'POST' && route === 'config') {
          const patch = await readJson(request)
          const saved = writeConfig(normalizeConfig(patch))
          const config = effectiveConfig()
          return sendJson(response, 200, { ok: true, value: { config, saved, detected: config.detected } })
        }
        if (request.method === 'POST' && route === 'run') {
          const body = await readJson(request)
          return sendJson(response, 200, { ok: true, value: await runBody(body) })
        }
        if (request.method === 'GET' && route === 'vars') {
          return sendJson(response, 200, { ok: true, value: await getSession().variables() })
        }
        if (request.method === 'POST' && route === 'var') {
          const body = await readJson(request)
          const name = String(body.name ?? '')
          if (name === '') throw new Error('missing variable name')
          const value = await getSession().assign(name, String(body.value ?? 'NULL'))
          return sendJson(response, 200, { ok: true, value })
        }
        if (request.method === 'GET' && route === 'tree') {
          const raw = queryParam(request.url, 'path')
          const config = effectiveConfig()
          const dir = raw !== undefined && raw !== '' ? resolvePath(raw) : config.workdir
          if (!isDirectory(dir)) throw new Error(`not a directory: ${dir}`)
          return sendJson(response, 200, {
            ok: true,
            value: {
              path: dir,
              parent: dirname(dir),
              roots: [config.workdir, effectiveScriptDir(config), ...config.extraRoots].filter(Boolean),
              entries: treeEntries(dir, { showHidden: queryParam(request.url, 'hidden') === '1' }),
            },
          })
        }
        if (request.method === 'POST' && route === 'app/start') {
          const body = await readJson(request)
          const config = effectiveConfig()
          if (!isAllowedPath(config, resolve(String(body.path ?? '')))) {
            throw new Error(`path outside the configured roots: ${body.path}`)
          }
          const started = await startShiny(config, body.path)
          return sendJson(response, 200, { ok: true, value: started })
        }
        if (request.method === 'POST' && route === 'app/stop') {
          const body = await readJson(request).catch(() => ({}))
          return sendJson(response, 200, { ok: true, value: stopShiny(body.pid ?? null) })
        }
        if (request.method === 'POST' && route === 'quarto/render') {
          const body = await readJson(request)
          return sendJson(response, 200, { ok: true, value: await renderQuarto(effectiveConfig(), body.path) })
        }
        if (request.method === 'GET' && route === 'browse') {
          const raw = queryParam(request.url, 'path')
          const config = effectiveConfig()
          // Browsing is how the user *picks* a folder, so it deliberately ignores the
          // workdir guard — it only reads directory names, never file contents.
          const want = String(raw ?? '').trim()
          const dir = want === '' ? homedir() : resolve(want)
          if (!isDirectory(dir)) throw new Error(`not a directory: ${dir}`)
          const dirents = readdirSync(dir, { withFileTypes: true })
            .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
            .map(entry => ({ name: entry.name, path: join(dir, entry.name) }))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
          return sendJson(response, 200, {
            ok: true,
            value: {
              path: dir,
              parent: dirname(dir) === dir ? null : dirname(dir),
              home: homedir(),
              workdir: config.workdir,
              scriptDir: effectiveScriptDir(config),
              entries: dirents.slice(0, 500),
              truncated: dirents.length > 500,
            },
          })
        }
        if (request.method === 'GET' && route === 'workspaces') {
          let items = []
          try {
            const list = ctx.workspaceRegistry?.list?.() ?? []
            items = (Array.isArray(list) ? list : [])
              .filter(item => typeof item?.path === 'string' && item.path !== '')
              .map(item => ({
                id: String(item.id ?? item.path),
                path: item.path,
                title: String(item.title ?? item.name ?? item.path),
              }))
          } catch {
            items = []
          }
          return sendJson(response, 200, { ok: true, value: { items } })
        }
        if (request.method === 'GET' && route === 'stat') {
          const path = resolvePath(queryParam(request.url, 'path'))
          const stat = statSync(path)
          return sendJson(response, 200, {
            ok: true,
            value: { path, mtimeMs: stat.mtimeMs, size: stat.size, dir: stat.isDirectory() },
          })
        }
        if (request.method === 'GET' && route === 'file') {
          const path = resolvePath(queryParam(request.url, 'path'))
          const kind = fileKind(path)
          if (kind === 'binary') return sendJson(response, 400, failure(new Error('binary file — open it with the artifact route')))
          const file = readTextFile(path)
          return sendJson(response, 200, { ok: true, value: { path, kind, ...file } })
        }
        if (request.method === 'POST' && route === 'file') {
          const body = await readJson(request)
          const path = resolvePath(body.path)
          if (fileKind(path) === 'binary') throw new Error('refusing to overwrite a binary file with text')
          const saved = writeTextFile(path, String(body.text ?? ''))
          return sendJson(response, 200, { ok: true, value: { path, ...saved } })
        }
        if (request.method === 'GET' && route === 'scripts') {
          const config = effectiveConfig()
          const dir = queryParam(request.url, 'dir') ?? config.workdir
          return sendJson(response, 200, { ok: true, value: { scripts: listRFiles(resolvePath(dir)) } })
        }
        if (request.method === 'POST' && route === 'save') {
          const body = await readJson(request)
          const config = effectiveConfig()
          const name = String(body.name ?? 'scratch').trim() || 'scratch'
          const withExt = /\.[A-Za-z0-9]+$/.test(name) ? name : `${name}.R`
          const path = resolve(join(effectiveScriptDir(config), withExt))
          const saved = writeTextFile(path, String(body.text ?? ''))
          return sendJson(response, 200, { ok: true, value: { path, ...saved } })
        }
        if (request.method === 'GET' && route === 'complete') {
          const line = queryParam(request.url, 'line') ?? ''
          const limit = Number(queryParam(request.url, 'limit') ?? 300)
          return sendJson(response, 200, { ok: true, value: await session.complete(line, limit) })
        }
        if (request.method === 'POST' && route === 'diagnose') {
          const body = await readJson(request)
          return sendJson(response, 200, { ok: true, value: await session.diagnose(String(body.code ?? '')) })
        }
        if (request.method === 'GET' && route === 'definition') {
          const name = queryParam(request.url, 'name') ?? ''
          return sendJson(response, 200, { ok: true, value: await session.definition(name) })
        }
        if (request.method === 'GET' && route === 'packages') {
          const refresh = (queryParam(request.url, 'refresh') ?? '') === '1'
          return sendJson(response, 200, { ok: true, value: await session.packages(refresh) })
        }
        if (request.method === 'POST' && route === 'package/install') {
          const body = await readJson(request)
          const value = await installPackage(effectiveConfig(), body.name)
          return sendJson(response, 200, { ok: true, value })
        }
        if (request.method === 'POST' && route === 'rmd/render') {
          const body = await readJson(request)
          const value = await renderRmd(effectiveConfig(), body.path)
          return sendJson(response, 200, { ok: true, value })
        }
        if ((request.method === 'POST') && (route === 'plot/delete' || route === 'plot/clear')) {
          const body = route === 'plot/delete' ? await readJson(request) : {}
          const config = effectiveConfig()
          const plotsDir = join(effectiveWorkdir(config), '.dsh-r-runner', 'plots')
          const isPlot = (candidate) => {
            const full = resolve(candidate)
            return full.includes(`${sep}.dsh-r-runner${sep}plots${sep}`) && isAllowedPath(config, full)
          }
          if (route === 'plot/clear') {
            const dir = resolve(plotsDir)
            let removed = 0
            try {
              for (const name of readdirSync(dir)) {
                if (!name.endsWith('.png')) continue
                try { unlinkSync(join(dir, name)); removed += 1 } catch {}
              }
            } catch {}
            return sendJson(response, 200, { ok: true, value: { removed } })
          }
          const path = resolvePath(String(body.path ?? ''))
          if (!isPlot(path)) throw new Error('refusing to delete a file outside the plot folder')
          try { unlinkSync(path) } catch {}
          return sendJson(response, 200, { ok: true, value: { path } })
        }
        if (request.method === 'GET' && route === 'artifact') {
          const path = resolvePath(queryParam(request.url, 'path'))
          const kind = /\.html?$/i.test(path) ? 'text/html; charset=utf-8'
            : path.toLowerCase().endsWith('.png') ? 'image/png'
            : path.toLowerCase().endsWith('.svg') ? 'image/svg+xml'
              : path.toLowerCase().endsWith('.pdf') ? 'application/pdf'
                : path.toLowerCase().endsWith('.jpg') || path.toLowerCase().endsWith('.jpeg') ? 'image/jpeg'
                  : 'application/octet-stream'
          const bytes = readFileSync(path)
          response.writeHead(200, { 'content-type': kind, 'content-length': bytes.length, 'cache-control': 'no-store' })
          response.end(bytes)
          return
        }
        if (request.method === 'POST' && route === 'session/restart') {
          const sessionNow = getSession()
          await sessionNow.stop()
          const started = await sessionNow.start()
          return sendJson(response, 200, { ok: true, value: { ...sessionNow.status(), started } })
        }
        if (request.method === 'POST' && route === 'session/stop') {
          const sessionNow = getSession()
          await sessionNow.stop()
          return sendJson(response, 200, { ok: true, value: sessionNow.status() })
        }
        if (request.method === 'GET' && route === 'roots') {
          const config = effectiveConfig()
          return sendJson(response, 200, {
            ok: true,
            value: { workdir: config.workdir, scriptDir: effectiveScriptDir(config), extraRoots: config.extraRoots },
          })
        }
        if (request.method === 'POST' && route === 'roots') {
          const body = await readJson(request)
          const target = resolvePath(body.path)
          const config = effectiveConfig()
          const next = body.action === 'remove'
            ? config.extraRoots.filter(root => resolve(root) !== target)
            : [...new Set([...config.extraRoots, target])]
          const saved = writeConfig({ extraRoots: next })
          return sendJson(response, 200, {
            ok: true,
            value: { workdir: saved.workdir || config.workdir, extraRoots: saved.extraRoots },
          })
        }
        if (request.method === 'GET' && route === 'history') {
          return sendJson(response, 200, { ok: true, value: { entries: readHistory(), path: historyPath() } })
        }
        if (request.method === 'POST' && route === 'history') {
          return sendJson(response, 200, { ok: true, value: { entries: clearHistory() } })
        }
        if (request.method === 'GET' && route === 'help') {
          const topic = queryParam(request.url, 'topic') ?? ''
          if (String(topic).trim() === '') throw new Error('missing ?topic=')
          const reply = await getSession().help(topic)
          if (reply.ok !== true) return sendJson(response, 404, failure(new Error(reply.error ?? 'no help found')))
          return sendJson(response, 200, { ok: true, value: reply })
        }
        if (request.method === 'GET' && route === 'data') {
          const name = queryParam(request.url, 'name') ?? ''
          if (String(name).trim() === '') throw new Error('missing ?name=')
          const limit = Number(queryParam(request.url, 'limit') ?? 100)
          const reply = await getSession().data(name, Number.isFinite(limit) ? limit : 100)
          if (reply.ok !== true) return sendJson(response, 400, failure(new Error(reply.error ?? 'cannot preview')))
          return sendJson(response, 200, { ok: true, value: reply })
        }
        return sendJson(response, 404, failure(new Error(`no route ${request.method} ${route}`)))
      } catch (error) {
        return sendJson(response, 500, failure(explain(error)))
      }
    },
  }), 'dsh-r-runner: /r/api routes')

  ctx.effect(() => () => {
    if (session !== null) session.stop().catch(() => {})
  }, 'dsh-r-runner: session lifecycle')
}
