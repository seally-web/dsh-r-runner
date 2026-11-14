# dsh-r-runner

Run R inside the DeepSeek Harness sidebar: a persistent R session, a file tree, a
syntax-highlighted editor, a console, an environment table, and plot thumbnails —
laid out like RStudio, with the keyboard habits of VS Code.

> Status: v0.1.0, macOS + R 4.6 tested. See [docs/PLAN.md](docs/PLAN.md) for the
> design notes and roadmap.

![Panel](docs/panel.png)

Click any plot thumbnail to open it full-size — fit-to-window or 100 %, flip through
the set with ← →, copy the path, or open the PNG in a new tab:

![Plot viewer](docs/lightbox.png)

## What you get

- **A session, not a script runner.** One long-lived `R --slave` process: variables,
  loaded packages and the graphics device survive between runs. A run costs 1–40 ms
  after the ~1 s boot.
- **RStudio-shaped layout.** File tree on the left, multi-tab editor in the middle,
  console and environment side by side at the bottom, plot strip above the status bar.
- **Editor habits from VS Code.** `⌘/Ctrl+Enter` runs the selection (or the buffer),
  `⌘/Ctrl+S` saves, Tab indents two spaces, the breadcrumb shows where you are.
- **Environment table.** Name / value / class / size, double-click a row to assign a
  new value with any R expression (`1:10`, `c("a","b")`, …).
- **Plots become files.** Every `plot()` is written to
  `.dsh-r-runner/plots/plot-<ts>-<pid>-NNN.png`; the panel shows thumbnails you can
  click to enlarge (fit / 100 %, ← → to browse, copy path, open the PNG), and the
  paths are plain files an agent can read.
- **Agent tool.** `r_run({ code })` / `r_run({ file })` lets the model run R directly
  and get back the console output plus plot paths.

## Install

Requires [R](https://cran.r-project.org) on the machine (`R` on `PATH`, or point the
plugin at it in settings). No R packages are required.

### From the market

Search for **R Runner** in the plugin market, install, reload the page (⌘/Ctrl+R),
then open the right sidebar → add control → **R Runner**.

### From a checkout

```bash
cd plugins/dsh-r-runner
sh bin/install-local.sh          # copies the payload into the desktop profile
# reload the page, then open the R panel

# verify the host half is live (routes registered, R spawns, plots work)
node bin/check.mjs http://127.0.0.1:<gui-port>
```

`bin/install-local.sh` writes `~/.dsh/r-runner.json` on first run and adds the bundle
to the profile manifest; `bin/reload-host.sh` forces the host to re-compose.

## Use

| Action | Shortcut |
| --- | --- |
| Run selection / buffer | `⌘/Ctrl+Enter` |
| Run everything | toolbar **运行全部** |
| Save (overwrite the real file) | `⌘/Ctrl+S` |
| Open the panel | `⌘⇧R` (web: `⌥⇧R`) |
| Restart the R session | toolbar **重启会话** |
| Edit a variable | double-click its row in the environment table |
| Enlarge a plot | click its thumbnail |
| Close / browse plots in the viewer | `Esc` / `←` `→` / `0` (fit ⇄ 100 %) |

Notes:

- Files opened from the tree are edited **in place**; `＋新建` creates a draft that is
  written to `<scriptDir>/<name>.R` when you save it.
- Unsaved edits live in `localStorage`, so reloading the page does not lose them.
- Running a file switches the working directory to that file's folder
  (`runInFileDir`), which is what `read.csv("data.csv")` usually wants.
- `plot()` output is a PNG per plot. `par(mfrow = c(2, 2))` therefore yields four files.

## Configuration

`~/.dsh/r-runner.json` (edited from the panel's settings page, or by hand):

```json
{
  "rBinary": "/usr/local/bin/R",
  "rscriptBinary": "/usr/local/bin/Rscript",
  "sessionArgs": "",
  "workdir": "/path/to/your-project",
  "scriptDir": "/path/to/your-project/R",
  "extraRoots": [],
  "runInFileDir": true,
  "autoSave": true,
  "plotWidth": 960,
  "plotHeight": 640,
  "plotRes": 110,
  "timeoutMs": 600000,
  "maxOutputChars": 400000,
  "env": {}
}
```

- **R binary** — `R` is resolved from the setting, then `PATH`, then the common macOS
  framework locations.
- **Working directory** — follows the current DSH session workspace unless you pin it
  (`autoDetect`), so switching projects in DSH switches the tree and the R cwd.
- **Extra roots** — additional folders shown in the tree (read/write allowed).
- **Plot size / resolution** — the PNG device parameters.
- **env** — extra environment variables for the R process (JSON object).

## Architecture

```
sidebar (lib/client.js: React via ModuleLoader, no build step)
      │  fetch /r/api/*
host half (lib/index.js: webServer + subprocess + workspaceRegistry)
      │  loopback TCP, newline-delimited JSON
R session (lib/driver.R: ping / run / vars / assign / rm / quit)
```

- `lib/driver.R` — the in-R server. Everything is wrapped in `local({ … })` so the
  driver's own objects never land in `globalenv`; `options(device = …)` redirects plots
  to PNG files; `capture.output(type = "output")` collects what `print`/`cat` printed.
- `lib/runner.js` — config, `RSession` (spawn, connect with retries, request queue),
  and the file helpers (tree, read/write, path policy).
- `lib/index.js` — routes, the `r_run` agent tool, workspace detection.
- `lib/client.js` — the panel. Hand-written `window.__ModuleLoader__.load({ factory })`
  bundle; no bundler, so editing it and reloading the page is the whole dev loop.

## Development

```bash
npm test                     # import / driver / host-unit / client-tokenize / client-smoke
node bin/preview-ui.mjs      # writes /tmp/rr-panel.html + /tmp/rr-settings.html
node bin/check.mjs <gui-url> # live check against a running DSH
```

`test/import.mjs` enforces the rule that keeps this plugin loadable across DSH
releases: **the host half may only import Node built-ins** (see Troubleshooting).

## Troubleshooting

**The panel is missing from the sidebar, and `r_run` is not in the tool list.**
The host half did not load. Check the route first:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:<gui-port>/r/api/state
```

`200` means loaded; `404` means it is not. On DSH ≥ 0.2.2 the usual cause is an import
that the profile can no longer resolve (`@deepseek-ai/dsh-tools` and friends). The
plugin then disappears silently — the plugin manager shows `enabled: true` with
`fiberPhase: null` (not `failed`, so there is no diagnostic). `test/import.mjs` exists
to catch exactly this; keep the host half on Node built-ins only.

**"R 不可用" in the settings page.** Point `rBinary` at the real binary
(`which R`, e.g. `/usr/local/bin/R`), then press **重启会话**.

**Run does nothing / hangs.** Open the toolbar **重启会话**, then run
`1 + 1`. If the session keeps dying, check `sessionArgs` (a bad flag kills `R` at
boot) and the console's error line.

**No plot thumbnail.** Plots come from the graphics device, so `plot()` must actually
be called; `ggplot2` objects need `print(p)`. Output lands in
`.dsh-r-runner/plots/` of the workdir — check the directory exists and is writable.

**First run feels slow.** The session boots `R` (~1 s) the first time; later runs reuse
it. **重启会话** pays that cost again.

**Warning: the R process can touch anything your user can.** It is not sandboxed;
`extraRoots` is a UI convenience, not a security boundary.

## License

MIT
