/**
 * R tokenizer test: loads the pre-bundled client in a VM and pins the token
 * split, so a highlighter change that breaks strings/comments/numbers is caught
 * without a browser.
 *   node test/client-tokenize.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
let loaded
runInNewContext(source, {
  window: { __ModuleLoader__: { load: (spec) => { loaded = spec } } },
  document: { getElementById: () => null, head: { appendChild: () => {} }, createElement: () => ({}) },
  localStorage: { getItem: () => null, setItem: () => {} },
  fetch: async () => ({ json: async () => ({ ok: true, value: {} }) }),
  console
}, { filename: 'client.js' })

const exports = loaded.factory(() => ({ createElement: () => ({}) }))
const { tokenizeLine, chunkAt, countChunks } = exports.__test

const kinds = (line) => Array.from(tokenizeLine(line), (token) => token.kind).join(',')
const text = (line) => tokenizeLine(line).map((token) => token.text).join('')

// A comment swallows the rest of the line.
assert.equal(kinds('# just a note'), 'comment')
assert.equal(text('# just a note'), '# just a note')

// Strings, including escapes, after code.
const assignment = tokenizeLine('y <- "a \\"quoted\\" b"')
assert.equal(text('y <- "a \\"quoted\\" b"'), 'y <- "a \\"quoted\\" b"')
assert.ok(assignment.some((token) => token.kind === 'string'))
assert.ok(assignment.some((token) => token.kind === 'operator'))

// Numbers vs names: 1e3 is one number, x1 stays plain.
const numeric = tokenizeLine('n <- 1e3 + 0.5L')
assert.ok(numeric.some((token) => token.kind === 'number'))
assert.equal(text('n <- 1e3 + 0.5L'), 'n <- 1e3 + 0.5L')

// Keywords and constants.
assert.match(kinds('for (i in 1:10) if (TRUE) NULL'), /keyword/)
assert.match(kinds('TRUE'), /constant/)
assert.match(kinds('library(ggplot2)'), /keyword/)

// The `%>%` pipe is an operator, and it does not eat the rest of the line.
const pipe = tokenizeLine('df %>% filter(x > 1)')
assert.ok(pipe.some((token) => token.kind === 'operator' && token.text === '%>%'))
assert.equal(text('df %>% filter(x > 1)'), 'df %>% filter(x > 1)')

// Backticked names.
assert.ok(tokenizeLine('`my column` <- 1').some((token) => token.kind === 'name'))

// Token text always reassembles the input line exactly.
for (const line of ['', 'x', '  # indented', 'a <- c("x", \'y\')', '##', '"unterminated', 'f(1,2)[3]$z@y']) {
  assert.equal(text(line), line, `round-trips ${JSON.stringify(line)}`)
}

// Rmd chunk detection: the chunk under the caret, and how many exist.
const rmd = [
  '---',
  'title: demo',
  '---',
  '',
  '```{r setup}',
  'library(ggplot2)',
  '```',
  '',
  '文本',
  '',
  '```{r plot}',
  'ggplot(iris, aes(Sepal.Length)) + geom_histogram()',
  '```',
].join('\n')
const setupAt = rmd.indexOf('library(ggplot2)')
const plotAt = rmd.indexOf('ggplot(iris')
assert.equal(chunkAt(rmd, setupAt).code.trim(), 'library(ggplot2)')
assert.equal(chunkAt(rmd, setupAt).index, 1)
assert.equal(chunkAt(rmd, plotAt).index, 2)
assert.match(chunkAt(rmd, plotAt).code, /geom_histogram/)
assert.equal(chunkAt(rmd, rmd.indexOf('title: demo')), null, 'front matter belongs to no chunk')
assert.equal(chunkAt(rmd, rmd.indexOf('```{r setup}') + 1).index, 1, 'a fence line is part of its chunk')
assert.equal(countChunks(rmd), 2)
assert.equal(chunkAt('x <- 1', 0), null, 'plain R has no chunks')

console.log('client-tokenize: ok')
