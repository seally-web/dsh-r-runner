# Changelog

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
