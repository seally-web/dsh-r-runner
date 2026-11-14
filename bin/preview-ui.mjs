#!/usr/bin/env node
/**
 * Renders the sidebar panel and its settings page to static HTML without a
 * browser session.
 *
 * The panel is plain React.createElement, so a small reactive stub is enough:
 * hooks are stored per component, state setters re-run the tree, effects are
 * flushed after each pass. The result is real markup plus the real CSS, i.e.
 * what the sidebar paints given the canned host responses below.
 *
 *   node bin/preview-ui.mjs
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
 *     --screenshot=/tmp/rr-panel.png --window-size=980,760 file:///tmp/rr-panel.html
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const source = readFileSync(`${root}/lib/client.js`, 'utf8')

const cssStart = source.indexOf('const CSS = `') + 'const CSS = `'.length
const css = source.slice(cssStart, source.indexOf('`\n', cssStart))

/* ── a tiny reactive React ───────────────────────────────────────────────── */
const GLOBAL = { hooks: new Map(), dirty: false, effects: [], current: null }
const reset = () => { for (const state of GLOBAL.hooks.values()) state.index = 0; GLOBAL.effects = [] }

const react = {
  Fragment: 'Fragment',
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState(initial) {
    const state = GLOBAL.hooks.get(GLOBAL.current)
    if (state === undefined) throw new Error('useState outside a component')
    const index = state.index++
    if (!(index in state.slots)) state.slots[index] = typeof initial === 'function' ? initial() : initial
    return [state.slots[index], (next) => {
      const value = typeof next === 'function' ? next(state.slots[index]) : next
      if (state.slots[index] !== value) { state.slots[index] = value; GLOBAL.dirty = true }
    }]
  },
  useEffect(fn) { GLOBAL.effects.push(fn) },
  useLayoutEffect(fn) { GLOBAL.effects.push(fn) },
  useRef(initial) {
    const state = GLOBAL.hooks.get(GLOBAL.current)
    const index = state.index++
    if (!(index in state.slots)) state.slots[index] = { current: initial }
    return state.slots[index]
  },
  useCallback: (fn) => fn,
  useMemo: (fn) => fn()
}

const store = new Map()
const localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
}
const document = {
  getElementById: () => null,
  head: { appendChild: () => {} },
  createElement: () => ({ style: {}, setAttribute() {} }),
  addEventListener() {}, removeEventListener() {}
}

/* ── canned host responses (what the sidebar normally fetches) ───────────── */
const workspace = '/Users/me/Documents/r-project'
const state = {
  ok: true,
  value: {
    mode: 'session',
    running: true,
    pid: 51234,
    uptimeMs: 184000,
    rBinary: '/usr/local/bin/R',
    rscriptBinary: '/usr/local/bin/Rscript',
    workdir: workspace,
    scriptDir: `${workspace}/R`,
    plots: ['/Users/me/Documents/r-project/R/plots/plot-20261114190512-51234-001.png',
      '/Users/me/Documents/r-project/R/plots/plot-20261114190644-51234-002.png'],
    lastError: null,
    probe: { ok: true, version: 'R version 4.6.2 (2026-10-29) -- "Diversified Portfolio"' },
    config: {
      rBinary: '/usr/local/bin/R',
      rscriptBinary: '/usr/local/bin/Rscript',
      sessionArgs: '',
      workdir: workspace,
      scriptDir: `${workspace}/R`,
      extraRoots: ['/Users/me/Documents/shared-analysis'],
      runInFileDir: true,
      autoSave: true,
      plotWidth: 960,
      plotHeight: 640,
      plotRes: 110,
      timeoutMs: 600000,
      maxOutputChars: 400000,
      env: {},
      configPath: '/Users/me/.dsh/r-runner.json',
      driverPath: '/Users/me/.dsh/profiles/desktop/node_modules/dsh-r-runner/lib/driver.R',
      detected: { source: 'session', cwd: workspace, label: '来自当前会话' }
    }
  }
}

const responses = {
  state,
  config: state,
  tree: {
    ok: true,
    value: {
      path: workspace,
      parent: '/Users/me/Documents',
      roots: [workspace, `${workspace}/R`],
      entries: [
        { name: 'R', path: `${workspace}/R`, dir: true, size: 0, mtimeMs: 0 },
        { name: 'data', path: `${workspace}/data`, dir: true, size: 0, mtimeMs: 0 },
        { name: 'output', path: `${workspace}/output`, dir: true, size: 0, mtimeMs: 0 },
        { name: 'analysis.R', path: `${workspace}/analysis.R`, dir: false, size: 2048, mtimeMs: 0 },
        { name: 'report.Rmd', path: `${workspace}/report.Rmd`, dir: false, size: 5120, mtimeMs: 0 },
        { name: 'sales.csv', path: `${workspace}/sales.csv`, dir: false, size: 90210, mtimeMs: 0 }
      ]
    }
  },
  vars: {
    ok: true,
    value: {
      running: true,
      variables: [
        { name: 'df', class: 'data.frame', size: '150 × 5', preview: 'Sepal.Length, Sepal.Width, …' },
        { name: 'fit', class: 'lm', size: '5', preview: 'Sepal.Length ~ Species' },
        { name: 'model', class: 'glm', size: '7', preview: 'binomial' },
        { name: 'x', class: 'numeric', size: '100', preview: '1.23, 4.56, 7.89, …' },
        { name: 'labels', class: 'character', size: '3', preview: '"setosa", "versicolor", …' }
      ]
    }
  },
  scripts: {
    ok: true,
    value: { scripts: [
      { name: 'analysis', file: 'analysis.R', path: `${workspace}/analysis.R` },
      { name: 'report', file: 'report.Rmd', path: `${workspace}/report.Rmd` }
    ] }
  },
  history: { ok: true, value: { entries: [] } },
  run: {
    ok: true,
    value: {
      ok: true,
      exitCode: 0,
      ms: 42,
      stdout: '[1] 42\n',
      stderr: '',
      error: null,
      plots: [],
      wd: workspace
    }
  }
}

const fetch = async (url) => {
  const route = String(url).replace(/^.*?\/r\/api\//, '').split(/[?&]/)[0]
  return { status: 200, text: async () => JSON.stringify(responses[route] ?? responses.state) }
}

const file = `${workspace}/analysis.R`
const code = [
  '# Iris: quick model and a figure',
  'library(ggplot2)',
  '',
  'df <- iris',
  'fit <- lm(Sepal.Length ~ Species, data = df)',
  'summary(fit)',
  '',
  'p <- ggplot(df, aes(Sepal.Length, Sepal.Width, colour = Species)) +',
  '  geom_point(size = 3) +',
  '  labs(title = "Iris")',
  'print(p)'
].join('\n')

store.set('dsh.r-runner.buffers', JSON.stringify({
  [`file:${file}`]: { code, name: 'analysis.R', path: file, baseline: code, mtimeMs: 0, at: Date.now() }
}))
store.set('dsh.r-runner.activeBuffer', `file:${file}`)
for (const key of ['showTree', 'showVars']) store.set(`dsh.r-runner.${key}`, '1')

let loaded
const window = { __ModuleLoader__: { load: (spec) => { loaded = spec } } }
runInNewContext(source, {
  window, document, localStorage, navigator: { language: 'zh-CN' }, fetch,
  setInterval: () => 0, clearInterval: () => {}, setTimeout: (fn) => setTimeout(fn, 0), console
}, { filename: 'client.js' })

const exportsLoaded = loaded.factory((id) => (id === 'react' ? react : {}))
let body
exportsLoaded.apply({
  effect: (fn) => { fn(); return () => {} },
  locale: { bind: () => (key) => key, register: () => () => {} },
  inject: () => {}, shortcuts: { register: () => () => {} },
  sidebarRight: { openTab: () => {} }, sidebarRightTabs: { register: () => () => {} },
  slots: { inject: (seat, fn) => fn(), register: (def, component) => {
    if (def.name === 'sidebar.right.pane.tab') body = component
    return () => {}
  } }
})

const t = (key) => key

const ATTRIBUTES = { className: 'class', htmlFor: 'for', tabIndex: 'tabindex' }
const escape = (text) => String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))
const styleToCss = (style) => Object.entries(style ?? {})
  .map(([key, value]) => `${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}:${value}`).join(';')

function render(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (Array.isArray(node)) return node.map(render).join('')
  if (typeof node === 'string' || typeof node === 'number') return escape(node)
  if (typeof node.type === 'function') {
    const previous = GLOBAL.current
    let state = GLOBAL.hooks.get(node.type)
    if (state === undefined) { state = { slots: [], index: 0 }; GLOBAL.hooks.set(node.type, state) }
    state.index = 0
    GLOBAL.current = node.type
    const output = node.type(node.props)
    GLOBAL.current = previous
    return render(output)
  }
  if (node.type === 'Fragment') return render(node.children)
  const { props } = node
  let attributes = ''
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'children' || key === 'value' || key === 'ref' || key === 'style' || /^on[A-Z]/.test(key)) continue
    const name = ATTRIBUTES[key] ?? (/^data-|^aria-|^[a-z][a-z0-9-]*$/.test(key) ? key : undefined)
    if (name !== undefined) attributes += ` ${name}="${escape(value)}"`
  }
  if (props.style !== undefined) attributes += ` style="${escape(styleToCss(props.style))}"`
  if (node.type === 'textarea') return `<textarea${attributes}>${escape(props.value ?? '')}</textarea>`
  if (node.type === 'input') {
    const extra = props.type === 'checkbox' ? (props.checked ? ' checked' : '') : ` value="${escape(props.value ?? '')}"`
    return `<input${attributes} type="${props.type ?? 'text'}"${extra}>`
  }
  if (node.type === 'option') return `<option${attributes}>${render(node.children)}</option>`
  if (node.type === 'img') return `<img${attributes}>`
  return `<${node.type}${attributes}>${render(node.children.flat(Infinity))}</${node.type}>`
}

const HISTORY_SAMPLE = [
  { code: 'df <- iris\nfit <- lm(Sepal.Length ~ Species, data = df)', ok: true, ms: 4, at: '2026-11-14T19:05:12Z' },
  { code: 'summary(fit)', ok: true, ms: 2, at: '2026-11-14T19:05:14Z' },
  { code: 'library(ggplot2)\np <- ggplot(df, aes(Sepal.Length, Sepal.Width, colour = Species)) + geom_point()', ok: true, ms: 61, at: '2026-11-14T19:05:20Z' },
  { code: 'mean(iris$Sepal.Length)', ok: true, ms: 1, at: '2026-11-14T19:05:22Z' },
  { code: 'nope()', ok: false, ms: 1, at: '2026-11-14T19:05:30Z' }
]

const HELP_SAMPLE = `lm {stats}                                            R Documentation

Fitting Linear Models

Description:

     'lm' is used to fit linear models, including multivariate ones.
     It can be used to carry out regression, single stratum analysis of
     variance and analysis of covariance.

Usage:

     lm(formula, data, subset, weights, na.action,
        method = "qr", model = TRUE, x = FALSE, y = FALSE, qr = TRUE,
        singular.ok = TRUE, contrasts = NULL, offset, ...)

Arguments:

 formula: an object of class '"formula"' (or one that can be coerced to
          that class): a symbolic description of the model to be fitted.

    data: an optional data frame, list or environment containing the
          variables in the model.`

const DATA_SAMPLE = {
  ok: true,
  name: 'df',
  kind: 'data.frame',
  columns: ['Sepal.Length', 'Sepal.Width', 'Petal.Length', 'Petal.Width', 'Species'],
  rows: [
    ['5.1', '3.5', '1.4', '0.2', 'setosa'],
    ['4.9', '3.0', '1.4', '0.2', 'setosa'],
    ['4.7', '3.2', '1.3', '0.2', 'setosa'],
    ['4.6', '3.1', '1.5', '0.2', 'setosa'],
    ['5.0', '3.6', '1.4', '0.2', 'setosa'],
    ['5.4', '3.9', '1.7', '0.4', 'setosa'],
    ['4.6', '3.4', '1.4', '0.3', 'setosa'],
    ['5.0', '3.4', '1.5', '0.2', 'setosa']
  ],
  total: 150,
  shown: 8
}

const page = (title, html) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>html,body{margin:0;height:100%;background:#fff;color:#1f2328;font-family:-apple-system,"PingFang SC",sans-serif}
#host{position:absolute;inset:0;display:flex}</style><style>${css}</style></head><body><div id="host">${html}</div></body></html>`

async function paint(props) {
  GLOBAL.hooks.clear()
  let html = ''
  for (let pass = 0; pass < 12; pass += 1) {
    GLOBAL.dirty = false
    reset()
    html = render({ type: body, props })
    const effects = GLOBAL.effects
    for (const effect of effects) { try { effect() } catch (error) { console.error('effect failed:', error) } }
    await new Promise((resolve) => setTimeout(resolve, 5))
    if (!GLOBAL.dirty && pass > 0) break
  }
  return html
}

writeFileSync('/tmp/rr-plot.html', page('plot', await paint({ useTabInfo: () => ({}), t, initialView: 'plot', initialPlot: 0 })))
writeFileSync('/tmp/rr-settings.html', page('settings', await paint({ useTabInfo: () => ({}), t, initialView: 'settings' })))
writeFileSync('/tmp/rr-panel.html', page('panel', await paint({ useTabInfo: () => ({}), t })))
writeFileSync('/tmp/rr-history.html', page('history', await paint({ useTabInfo: () => ({}), t, preview: { bottomTab: 'history', historyEntries: HISTORY_SAMPLE } })))
writeFileSync('/tmp/rr-help.html', page('help', await paint({ useTabInfo: () => ({}), t, preview: { bottomTab: 'help', helpTopic: 'lm', helpText: HELP_SAMPLE } })))
writeFileSync('/tmp/rr-data.html', page('data', await paint({ useTabInfo: () => ({}), t, preview: { bottomTab: 'data', dataName: 'df', dataTable: DATA_SAMPLE } })))
console.log('wrote /tmp/rr-panel.html /tmp/rr-plot.html /tmp/rr-settings.html')
