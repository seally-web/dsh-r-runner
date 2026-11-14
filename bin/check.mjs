#!/usr/bin/env node
/**
 * Probe the running DSH GUI's R runner host half.
 *
 *   node bin/check.mjs http://127.0.0.1:56628
 *   DSH_GUI_URL=http://127.0.0.1:56628 node bin/check.mjs
 *
 * Exits non-zero when the routes are missing (the host half did not load) so it
 * can be used as a post-install gate.
 */
import { argv, env, exit } from 'node:process'

const base = (argv[2] ?? env.DSH_GUI_URL ?? '').replace(/\/+$/, '')
if (base === '') {
  console.error('usage: node bin/check.mjs <gui-url>   (or set DSH_GUI_URL)')
  exit(2)
}

async function request(route, init) {
  const response = await fetch(`${base}/r/api/${route}`, init)
  const text = await response.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    payload = undefined
  }
  return { status: response.status, payload, text }
}

const state = await request('state')
if (state.status !== 200) {
  console.error(`state: HTTP ${state.status} — the host half is not loaded`)
  console.error(state.text.slice(0, 300))
  exit(1)
}
const value = state.payload?.value ?? {}
console.log(`state: 200 · session ${value.running ? `running (pid ${value.pid})` : 'stopped'} · workdir ${value.config?.workdir ?? '?'}`)
console.log(`probe: ${value.probe?.ok === true ? value.probe.version : `not ok (${value.probe?.error ?? '?'})`}`)

const run = await request('run', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: 'cat("r-runner ok:", 6 * 7, "\\n")' })
})
if (run.status !== 200 || run.payload?.ok !== true) {
  console.error(`run: HTTP ${run.status} — ${run.text.slice(0, 300)}`)
  exit(1)
}
const result = run.payload.value
console.log(`run: exit ${result.exitCode} · ${Math.round(result.ms)} ms · stdout ${JSON.stringify(result.stdout)}`)
if (!String(result.stdout).includes('42')) {
  console.error('run: expected 42 in the console output')
  exit(1)
}

const plot = await request('run', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: 'plot(1:5, main = "check")' })
})
const plots = plot.payload?.value?.plots ?? []
console.log(`plots: ${plots.length} captured${plots.length > 0 ? ` → ${plots[0]}` : ''}`)
if (plots.length === 0) {
  console.error('plots: no PNG was captured')
  exit(1)
}

const vars = await request('vars')
const names = (vars.payload?.value?.variables ?? []).map((entry) => entry.name)
console.log(`vars: ${names.length === 0 ? '(empty)' : names.join(', ')}`)

console.log('check: ok — the R runner host half is live')
