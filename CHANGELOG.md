# Changelog

## 0.1.6

- Runs now carry the file they came from (`POST /r/api/run { code, path }`), so
  `read.csv("claims.csv")` resolves against the script's folder instead of the
  workspace root. `runInFileDir` actually takes effect, and an explicit `wd` wins.
- Scripts that find themselves through `commandArgs()` (`--file=`) now work: the
  driver attaches a shim for the duration of the run, in its own environment so a
  leading `rm(list = ls())` cannot remove it.
- A failed `cannot open file 'x'` run looks for that file in the script's folder and
  its parent, and the panel offers a one-click "rerun from that directory" bar.
- The session badge refreshes after a run, so an auto-started session no longer
  claims "会话未启动".
- `⌘/Ctrl+Shift+Enter` sources the whole file (plain `⌘Enter` still runs the
  selection, or the buffer when nothing is selected).
- Pressing run starts a stopped session instead of failing with "R session is not
  running"; polls and 停止 still never boot it implicitly.
- Settings notice when the workspace holds nothing but `.Rproj`, with a "use the
  parent folder" button.

## 0.1.5

- Fix: declare `sessions` in the client `inject` list. The client context refuses
  undeclared services, so the session workspace lookup threw and silently resolved
  to nothing.
- The panel now follows its seat session: `inject` → `props.sessionId` →
  `ctx.sessions` → `?cwd=`, with a subscription so switching sessions re-bootstraps
  the tree and the settings draft.
- Add `GET/POST /r/api/debug/props` for diagnosing what the host shell hands a slot.

## 0.1.4

- Fix: the client factory only receives `require`; a component read a free `ctx`
  identifier and threw on render, leaving the tab blank. The apply-time context is
  kept in a module variable now, with a no-props render test.

## 0.1.3

- Workspace following: send the session cwd, re-bootstrap on session switch, mirror a
  followed workspace into the settings form. (Superseded by 0.1.5.)

## 0.1.2

- Follow the session workspace in the host; derive the script folder from it; drop
  runtime fields (`detected`, …) from the saved config; poll `/state` every 15 s.

## 0.1.1

- First public release: hosted R session over loopback TCP, editor, tree, console,
  environment table, plot window, packages, history, help, data viewer, Shiny/Quarto
  preview, completion and diagnostics.
