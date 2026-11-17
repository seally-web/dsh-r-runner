/**
 * Client bundle smoke test without a browser: supplies the module-loader shell,
 * a React stub, and a fake client context, then checks the plugin registers its
 * tab type, body, title, dictionaries and shortcut with the shapes the sidebar
 * expects.
 *   node test/client-smoke.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

let loaded
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'Fragment',
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  useCallback: (fn) => fn,
  useLayoutEffect: () => {}
}
const requireStub = (id) => {
  if (id === 'react') return reactStub
  if (id === 'react/jsx-runtime') return { jsx: reactStub.createElement, jsxs: reactStub.createElement, Fragment: 'Fragment' }
  return {}
}

const window = { __ModuleLoader__: { load: (spec) => { loaded = spec } } }
const document = {
  getElementById: () => null,
  head: { appendChild: () => {} },
  createElement: () => ({ set textContent(value) { this._text = value }, id: '' })
}
const storage = new Map()
const localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value))
}

runInNewContext(source, {
  window,
  document,
  localStorage,
  navigator: { language: 'zh-CN' },
  fetch: async () => ({ json: async () => ({ ok: true, value: {} }) }),
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  requestAnimationFrame: (fn) => fn(),
  console
}, { filename: 'client.js' })

assert.equal(loaded.id, 'dsh-r-runner')
assert.equal(typeof loaded.factory, 'function')
const exports = loaded.factory(requireStub)
assert.equal(typeof exports.apply, 'function')
assert.ok(Array.isArray(exports.inject))
for (const service of ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight']) {
  assert.ok(exports.inject.includes(service), `inject lists ${service}`)
}

const calls = { effect: [], locale: [], tabs: [], slots: [], shortcuts: [] }
const disposer = () => {}
const ctx = {
  effect: (fn, label) => { calls.effect.push(label); return disposer(fn()) },
  locale: {
    bind: () => (key) => key,
    register: (ns, dictionaries) => { calls.locale.push({ ns, dictionaries }); return disposer() }
  },
  inject: (services, fn) => { if (services.includes('shortcuts')) fn(ctx) },
  shortcuts: { register: (definition) => { calls.shortcuts.push(definition); return disposer() } },
  sidebarRight: { openTab: () => {} },
  sidebarRightTabs: { register: (definition) => { calls.tabs.push(definition); return disposer() } },
  slots: {
    inject: (seat, fn) => fn(),
    register: (definition, body) => { calls.slots.push({ definition, body }); return disposer() }
  }
}

exports.apply(ctx)

// Tab type ---------------------------------------------------------------
assert.equal(calls.tabs.length, 1)
const tab = calls.tabs[0]
assert.equal(tab.kind, 'r-runner')
assert.equal(tab.id, 'dsh-r-runner')
assert.equal(tab.priority, 'extension')
assert.equal(typeof tab.title(), 'string')
assert.equal(tab.guide.length, 1)
assert.equal(tab.guide[0].id, 'r')
assert.equal(tab.guide[0].order, 60)
assert.equal(typeof tab.guide[0].title(), 'string')
assert.equal(typeof tab.guide[0].icon(), 'object')

// Slots ------------------------------------------------------------------
assert.equal(calls.slots.length, 2)
const body = calls.slots.find((entry) => entry.definition.name === 'sidebar.right.pane.tab')
const title = calls.slots.find((entry) => entry.definition.name === 'sidebar.right.pane.tab.title')
assert.ok(body, 'body registered on sidebar.right.pane.tab')
assert.ok(title, 'title registered on sidebar.right.pane.tab.title')
assert.equal(body.definition.key, 'dsh-r-runner')
assert.equal(body.definition.locale, 'rRunner')
assert.equal(typeof body.body, 'function')
assert.equal(typeof title.body, 'function')

// Locale dictionaries ----------------------------------------------------
assert.equal(calls.locale.length, 1)
assert.deepEqual(Object.keys(calls.locale[0].dictionaries).sort(), ['en', 'zh'])
for (const key of ['run', 'save', 'settings', 'environment', 'plots', 'empty']) {
  assert.ok(calls.locale[0].dictionaries.zh[key] !== undefined, `zh dictionary has ${key}`)
  assert.ok(calls.locale[0].dictionaries.en[key] !== undefined, `en dictionary has ${key}`)
}

// Shortcut ---------------------------------------------------------------
assert.equal(calls.shortcuts.length, 1)
const shortcut = calls.shortcuts[0]
assert.equal(shortcut.id, 'r.runner.open')
for (const platform of ['desktop:macos', 'desktop:windows', 'desktop:linux', 'web:macos', 'web:windows']) {
  assert.ok(shortcut.defaults[platform], `shortcut default for ${platform}`)
}
assert.equal(shortcut.resolve().status, 'handled')

// Session workspace ------------------------------------------------------
const sessionCwd = '/Users/me/Documents/other-project'
const sessionCtx = {
  ...ctx,
  sessions: {
    list: {
      getSnapshot: () => ({ byId: { 's-1': { cwd: sessionCwd } } }),
      subscribe: () => () => {}
    }
  }
}
exports.__test.clearActiveCwd()
assert.equal(exports.__test.withWorkspace('/r/api/state').includes('cwd='), false)
body.body({ ctx: sessionCtx, sessionId: 's-1' })
assert.equal(exports.__test.withWorkspace('/r/api/state'), `/r/api/state?cwd=${encodeURIComponent(sessionCwd)}`)
assert.equal(exports.__test.withWorkspace('/r/api/tree?path=x'), `/r/api/tree?path=x&cwd=${encodeURIComponent(sessionCwd)}`)
exports.__test.clearActiveCwd()
assert.equal(exports.__test.withWorkspace('/r/api/state').includes('cwd='), false)

console.log('client-smoke: ok')
console.log('effect labels:', calls.effect.join(' | '))
