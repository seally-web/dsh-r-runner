/**
 * dsh-r-runner — browser half.
 *
 * A pre-bundled ESM factory (no build step) that registers one page-type tab in
 * the right sidebar: an RStudio-shaped workbench with a file tree, a source
 * editor with R syntax highlighting, a console, an environment (variables)
 * pane, a plot gallery, and a settings pane for the runtime, the folders, the
 * execution policy and the graphics device.
 * @module dsh-r-runner/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-r-runner',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const react = require('react')
    require('@deepseek-ai/dsh-client-ui-primitives')
    // Portals let the plot viewer be a real floating window: it is mounted on
    // document.body, so no sidebar transform/overflow can clip or squash it.
    const reactDom = (() => { try { return require('react-dom') } catch { return null } })()
    const h = react.createElement

    /** Copy namespace, tab kind, implementation identity. */
    const NS = 'rRunner'
    const KIND = 'r-runner'
    const ID = 'dsh-r-runner'
    const CODE_KEY = 'dsh.r-runner.code'
    const NAME_KEY = 'dsh.r-runner.name'
    const BUFFERS_KEY = 'dsh.r-runner.buffers'
    const ACTIVE_KEY = 'dsh.r-runner.activeBuffer'
    const CONSOLE_KEY = 'dsh.r-runner.consoleHeight'
    const BOTTOM_TAB_KEY = 'dsh.r-runner.bottomTab'
    const TREE_WIDTH_KEY = 'dsh.r-runner.treeWidth'
    const TREE_OPEN_KEY = 'dsh.r-runner.treeOpen'
    const VARS_OPEN_KEY = 'dsh.r-runner.varsOpen'

    const SAMPLE = [
      '# Cmd/Ctrl+Enter runs the buffer (or just the selection).',
      'version$version.string',
      'x <- seq(0, 2 * pi, length.out = 200)',
      'plot(x, sin(x), type = "l", col = "#0a7aff", lwd = 2,',
      '     main = "sin(x)", xlab = "x", ylab = "sin(x)")',
      'cat("saved", nrow(data.frame(x, y = sin(x))), "points\\n")',
    ].join('\n')

    // ---------------------------------------------------------------- storage

    function readFlag(key, fallback) {
      const raw = localStorage.getItem(key)
      if (raw === null) return fallback
      return raw === '1'
    }

    function writeFlag(key, value) {
      try {
        localStorage.setItem(key, value ? '1' : '0')
      } catch {
        /* storage disabled: the toggle still works for this render */
      }
    }

    function readNumber(key, fallback) {
      const value = Number(localStorage.getItem(key))
      return Number.isFinite(value) && value > 0 ? value : fallback
    }

    function readBuffers() {
      try {
        const parsed = JSON.parse(localStorage.getItem(BUFFERS_KEY) ?? '{}')
        return parsed !== null && typeof parsed === 'object' ? parsed : {}
      } catch {
        return {}
      }
    }

    function writeBuffers(buffers) {
      try {
        localStorage.setItem(BUFFERS_KEY, JSON.stringify(buffers))
      } catch {
        /* quota: buffers still live in memory for this session */
      }
    }

    /** Workspace reported by the panel's session; the host uses it to detect folders. */
    let activeCwd = undefined
    function setActiveCwd(cwd) {
      if (typeof cwd === 'string' && cwd.trim() !== '') activeCwd = cwd.trim()
    }
    function withWorkspace(url) {
      if (activeCwd === undefined) return url
      return url + (url.includes('?') ? '&' : '?') + 'cwd=' + encodeURIComponent(activeCwd)
    }

    // -------------------------------------------------------------------- i18n

    const zh = {
      'type.label': 'R',
      'guide.title': 'R 运行器',
      'guide.description': '在侧边栏写并运行 R 代码',
      label: 'R 运行器',
      run: '运行',
      running: '运行中…',
      source: '全部运行',
      stop: '停止',
      restart: '重启会话',
      save: '保存',
      settings: '设置',
      close: '返回编辑器',
      idle: '就绪',
      exited: '已结束',
      failed: '运行失败',
      empty: '还没有输出。写点 R 代码，按 ⌘/Ctrl+Enter 运行。',
      exit: '状态',
      elapsed: '耗时',
      output: '控制台',
      timedOut: '已超时',
      missing: '未找到 R，检查设置里的路径',
      files: '文件',
      environment: '环境',
      plots: '图形',
      noPlots: '运行带 plot 的代码后，图会出现在这里。',
      noVars: '环境是空的：先运行一段代码。',
      refresh: '刷新',
      up: '上一级',
      treeRoot: '切换文件夹',
      name: '名称',
      value: '值',
      class: '类型',
      size: '大小',
      editVar: '编辑变量',
      editVarHint: '输入 R 表达式，例如 1:10 或 c("a","b")',
      apply: '应用',
      cancel: '取消',
      newFile: '新建',
      unsaved: '未保存',
      saved: '已保存',
      draft: '草稿',
      workdir: '工作目录',
      configPath: '配置文件',
      runMode: '运行',
      workspaceSection: '工作区',
      rRuntime: 'R',
      execution: '执行',
      graphics: '图形',
      environmentSection: '环境变量',
      infoSection: '信息',
      rBinary: 'R 可执行文件',
      rscriptBinary: 'Rscript（解析驱动路径用）',
      sessionArgs: '会话启动参数（空格分隔，如 --vanilla）',
      scriptDir: '脚本保存目录',
      extraRoots: '额外的文件夹',
      addRoot: '添加文件夹',
      removeRoot: '移除',
      runInFileDir: '运行文件时以文件所在目录为工作目录',
      autoSave: '运行成功后自动保存到文件',
      timeoutMs: '运行超时（毫秒）',
      maxOutputChars: '单次输出上限（字符）',
      plotWidth: '图宽（像素）',
      plotHeight: '图高（像素）',
      plotRes: '图分辨率（dpi）',
      envJson: '环境变量（JSON 对象，如 {"R_LIBS_USER":"~/R"}）',
      saveConfig: '保存配置',
      resetConfig: '恢复默认',
      restartNow: '重启会话',
      detectedWorkspace: '检测到的工作区',
      detectedSession: '来自当前会话',
      detectedRegistry: '来自已注册工作区',
      detectedFallback: '来自宿主进程目录（未检测到会话）',
      configSaved: '配置已保存',
      sessionRunning: '会话进行中',
      sessionStopped: '会话未启动',
      probeOk: 'R 可用',
      probeFailed: 'R 不可用',
      buffers: '打开的脚本',
      shortcut: '打开 R 运行器',
      selection: '运行选中',
      history: '运行历史',
      insertPlot: '复制路径',
      copyPath: '复制路径',
      copied: '已复制',
      line: '行',
      col: '列',
      resetOk: '已恢复默认配置'
    }

    const en = {
      'type.label': 'R',
      'guide.title': 'R runner',
      'guide.description': 'Edit and run R in the sidebar',
      label: 'R runner',
      run: 'Run',
      running: 'Running…',
      source: 'Source',
      stop: 'Stop',
      restart: 'Restart session',
      save: 'Save',
      settings: 'Settings',
      close: 'Back to editor',
      idle: 'Ready',
      exited: 'Finished',
      failed: 'Run failed',
      empty: 'No output yet. Write some R and press Cmd/Ctrl+Enter.',
      exit: 'Status',
      elapsed: 'Elapsed',
      output: 'Console',
      timedOut: 'timed out',
      missing: 'R was not found — check the path in Settings',
      files: 'Files',
      environment: 'Environment',
      plots: 'Plots',
      noPlots: 'Run code that draws to see plots here.',
      noVars: 'The environment is empty — run some code first.',
      refresh: 'Refresh',
      up: 'Up',
      treeRoot: 'Folder',
      name: 'Name',
      value: 'Value',
      class: 'Class',
      size: 'Size',
      editVar: 'Edit variable',
      editVarHint: 'Enter an R expression, e.g. 1:10 or c("a","b")',
      apply: 'Apply',
      cancel: 'Cancel',
      newFile: 'New',
      unsaved: 'unsaved',
      saved: 'saved',
      draft: 'Draft',
      workdir: 'Working directory',
      configPath: 'Config file',
      runMode: 'Run',
      workspaceSection: 'Workspace',
      rRuntime: 'R',
      execution: 'Execution',
      graphics: 'Graphics',
      environmentSection: 'Environment',
      infoSection: 'Info',
      rBinary: 'R binary',
      rscriptBinary: 'Rscript (used to locate the driver)',
      sessionArgs: 'Session arguments (space separated, e.g. --vanilla)',
      scriptDir: 'Script folder',
      extraRoots: 'Extra folders',
      addRoot: 'Add folder',
      removeRoot: 'Remove',
      runInFileDir: 'Run files with the file folder as working directory',
      autoSave: 'Save the buffer after a successful run',
      timeoutMs: 'Run timeout (ms)',
      maxOutputChars: 'Output cap (characters)',
      plotWidth: 'Plot width (px)',
      plotHeight: 'Plot height (px)',
      plotRes: 'Plot resolution (dpi)',
      envJson: 'Environment variables (JSON object, e.g. {"R_LIBS_USER":"~/R"})',
      saveConfig: 'Save settings',
      resetConfig: 'Restore defaults',
      restartNow: 'Restart session',
      detectedWorkspace: 'Detected workspace',
      detectedSession: 'from this session',
      detectedRegistry: 'from a registered workspace',
      detectedFallback: 'from the host process folder (no session detected)',
      configSaved: 'Settings saved',
      sessionRunning: 'Session running',
      sessionStopped: 'Session not started',
      probeOk: 'R is available',
      probeFailed: 'R is not available',
      buffers: 'Open scripts',
      shortcut: 'Open the R runner',
      selection: 'Run selection',
      history: 'Run history',
      insertPlot: 'Copy path',
      copyPath: 'Copy path',
      copied: 'Copied',
      line: 'Ln',
      col: 'Col',
      resetOk: 'Defaults restored'
    }

    // ---------------------------------------------------------------- highlight

    const R_KEYWORDS = new Set([
      'function', 'if', 'else', 'for', 'while', 'repeat', 'next', 'break', 'in',
      'return', 'switch', 'tryCatch', 'stop', 'warning', 'message', 'library',
      'require', 'source', 'print', 'cat', 'paste', 'paste0', 'c', 'list',
      'data.frame', 'matrix', 'vector', 'seq', 'seq_len', 'rep', 'sapply', 'lapply',
      'vapply', 'mapply', 'tapply', 'apply', 'lapply', 'do.call', 'subset', 'merge',
      'setwd', 'getwd', 'read.csv', 'read.table', 'readRDS', 'saveRDS', 'write.csv'
    ])

    const R_CONSTANTS = new Set(['TRUE', 'FALSE', 'NULL', 'NA', 'NA_integer_', 'NA_real_', 'NA_character_', 'Inf', 'NaN'])

    /** Split one line into highlight tokens: `{ text, kind }`. */
    function tokenizeLine(line) {
      const tokens = []
      let index = 0
      let text = ''
      const flush = () => {
        if (text !== '') tokens.push({ text, kind: 'plain' })
        text = ''
      }
      while (index < line.length) {
        const char = line[index]
        if (char === '#') {
          flush()
          tokens.push({ text: line.slice(index), kind: 'comment' })
          index = line.length
          break
        }
        if (char === '"' || char === "'") {
          flush()
          const quote = char
          let end = index + 1
          while (end < line.length) {
            if (line[end] === '\\') {
              end += 2
              continue
            }
            end += 1
            if (line[end - 1] === quote) break
          }
          tokens.push({ text: line.slice(index, end), kind: 'string' })
          index = end
          continue
        }
        if (char === '`') {
          flush()
          const end = line.indexOf('`', index + 1)
          const stop = end === -1 ? line.length : end + 1
          tokens.push({ text: line.slice(index, stop), kind: 'name' })
          index = stop
          continue
        }
        if (char === '%') {
          flush()
          const end = line.indexOf('%', index + 1)
          const stop = end === -1 ? line.length : end + 1
          tokens.push({ text: line.slice(index, stop), kind: 'operator' })
          index = stop
          continue
        }
        if (/[0-9]/.test(char) && (index === 0 || !/[A-Za-z0-9._]/.test(line[index - 1]))) {
          flush()
          let end = index + 1
          while (end < line.length && /[0-9.eE+\-Li]/.test(line[end])) {
            if ((line[end] === '-' || line[end] === '+') && !/[eE]/.test(line[end - 1])) break
            end += 1
          }
          tokens.push({ text: line.slice(index, end), kind: 'number' })
          index = end
          continue
        }
        if (/[A-Za-z._]/.test(char)) {
          let end = index + 1
          while (end < line.length && /[A-Za-z0-9._]/.test(line[end])) end += 1
          const word = line.slice(index, end)
          if (R_CONSTANTS.has(word)) {
            flush()
            tokens.push({ text: word, kind: 'constant' })
          } else if (R_KEYWORDS.has(word)) {
            flush()
            tokens.push({ text: word, kind: 'keyword' })
          } else {
            text += word
          }
          index = end
          continue
        }
        if ('+-*/^<>=!&|~?:$@(){}[],;'.includes(char)) {
          flush()
          let end = index + 1
          while (end < line.length && '<>=!&|'.includes(line[end]) && '<>=!&|'.includes(char)) end += 1
          tokens.push({ text: line.slice(index, end), kind: 'operator' })
          index = end
          continue
        }
        text += char
        index += 1
      }
      flush()
      return tokens
    }

    // --------------------------------------------------------------------- API

    async function api(route, options) {
      const init = options ?? {}
      const response = await fetch(withWorkspace('/r/api/' + route), {
        method: init.method ?? 'GET',
        headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        cache: 'no-store'
      })
      const text = await response.text()
      let payload
      try {
        payload = JSON.parse(text)
      } catch {
        throw new Error(`bad response (${response.status}): ${text.slice(0, 200)}`)
      }
      if (payload?.ok === true) return payload.value
      throw new Error(payload?.error?.message ?? `request failed (${response.status})`)
    }

    const artifactUrl = (path) => withWorkspace('/r/api/artifact?path=' + encodeURIComponent(path))

    // --------------------------------------------------------------------- CSS

    const CSS = `
.rr-root { display:flex; flex-direction:column; height:100%; min-height:0; width:100%; min-width:0; --rr-fg: inherit; --rr-muted: rgba(127,127,127,.92); --rr-border: rgba(127,127,127,.30); --rr-border-soft: rgba(127,127,127,.16); --rr-bg-soft: rgba(127,127,127,.07); --rr-bg-hover: rgba(127,127,127,.14); --rr-bg: #ffffff; --rr-bg-elev: #ffffff; --rr-accent: #0a7aff; --rr-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; font-size:12px; color:var(--rr-fg); }
.rr-root * { box-sizing:border-box; }
/* The plot window is portalled to <body>, so it must carry the tokens itself. */
.rr-lb-portal { --rr-muted: rgba(127,127,127,.92); --rr-border: rgba(127,127,127,.30); --rr-border-soft: rgba(127,127,127,.16); --rr-bg-soft: rgba(127,127,127,.07); --rr-bg-hover: rgba(127,127,127,.14); --rr-bg: #ffffff; --rr-accent: #0a7aff; --rr-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; font-family:-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size:12px; }
@media (prefers-color-scheme: dark) {
  .rr-root, .rr-lb-portal { --rr-bg: #23272e; --rr-bg-elev: #2a2f37; --rr-bg-soft: rgba(255,255,255,.05); --rr-bg-hover: rgba(255,255,255,.10); --rr-border: rgba(255,255,255,.20); --rr-border-soft: rgba(255,255,255,.10); --rr-muted: rgba(200,205,212,.78); }
  .rr-lb-portal { background: rgba(5,7,10,.62); }
}
.rr-toolbar { display:flex; align-items:center; gap:6px; padding:5px 8px; flex:none; flex-wrap:wrap; border-bottom:1px solid var(--rr-border); background:var(--rr-bg-soft); }
.rr-group { display:flex; align-items:center; gap:4px; }
.rr-group + .rr-group { border-left:1px solid var(--rr-border-soft); padding-left:6px; margin-left:2px; }
.rr-spacer { flex:1 1 auto; }
.rr-btn { display:inline-flex; align-items:center; justify-content:center; gap:5px; height:24px; padding:0 9px; border-radius:5px; border:1px solid transparent; background:transparent; color:inherit; font:inherit; font-size:11.5px; cursor:pointer; white-space:nowrap; }
.rr-btn:hover:not(:disabled) { background:var(--rr-bg-hover); }
.rr-btn:focus-visible { outline:1px solid var(--rr-accent); outline-offset:1px; }
.rr-btn:disabled { opacity:.45; cursor:default; }
.rr-btn[data-primary="true"] { background:var(--rr-accent); border-color:var(--rr-accent); color:#fff; }
.rr-btn[data-primary="true"]:hover:not(:disabled) { filter:brightness(1.05); background:var(--rr-accent); }
.rr-btn[data-on="true"] { background:var(--rr-bg-hover); border-color:var(--rr-border-soft); }
.rr-badge { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 8px; border-radius:999px; border:1px solid var(--rr-border); font-size:10.5px; color:var(--rr-muted); white-space:nowrap; }
.rr-dot { width:7px; height:7px; border-radius:50%; background:rgba(127,127,127,.55); flex:none; }
.rr-dot[data-on="true"] { background:#2bb673; }
.rr-dot[data-busy="true"] { background:#e0a300; }
.rr-main { display:flex; flex:1 1 auto; min-height:0; }
.rr-tree { display:flex; flex-direction:column; flex:none; min-width:0; border-right:1px solid var(--rr-border); background:var(--rr-bg-soft); }
.rr-tree[hidden] { display:none; }
.rr-tree-head { display:flex; align-items:center; gap:4px; padding:5px 6px; border-bottom:1px solid var(--rr-border-soft); flex:none; }
.rr-tree-scroll { flex:1 1 auto; overflow:auto; padding:2px 0 8px; }
.rr-tree-row { display:flex; align-items:center; gap:5px; width:100%; padding:2px 8px; border:0; background:transparent; color:inherit; font:inherit; font-size:11.5px; text-align:left; cursor:pointer; height:22px; }
.rr-tree-row:hover { background:var(--rr-bg-hover); }
.rr-tree-row[data-active="true"] { background:rgba(10,122,255,.16); }
.rr-tree-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rr-tree-empty { padding:8px 10px; color:var(--rr-muted); font-size:11px; }
.rr-vsplit { flex:none; width:5px; cursor:col-resize; background:var(--rr-bg-soft); border-left:1px solid var(--rr-border-soft); border-right:1px solid var(--rr-border-soft); }
.rr-editor-col { display:flex; flex-direction:column; flex:1 1 auto; min-width:0; min-height:0; }
.rr-tabs { display:flex; align-items:stretch; flex:none; overflow-x:auto; border-bottom:1px solid var(--rr-border-soft); background:var(--rr-bg-soft); scrollbar-width:thin; }
.rr-tab { display:flex; align-items:center; gap:6px; padding:3px 8px; font-size:11px; border:0; border-right:1px solid var(--rr-border-soft); background:transparent; color:var(--rr-muted); cursor:pointer; white-space:nowrap; font:inherit; max-width:190px; }
.rr-tab[data-active="true"] { color:var(--rr-fg); background:transparent; border-bottom:1px solid transparent; box-shadow: inset 0 -2px 0 var(--rr-accent); }
.rr-tab-name { overflow:hidden; text-overflow:ellipsis; }
.rr-tab-dot { width:6px; height:6px; border-radius:50%; background:var(--rr-accent); flex:none; }
.rr-crumb { display:flex; align-items:center; gap:6px; padding:3px 10px; font-size:11px; color:var(--rr-muted); border-bottom:1px solid var(--rr-border-soft); flex:none; }
.rr-crumb-path { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; direction:rtl; text-align:left; flex:1 1 auto; }
.rr-code-area { position:relative; flex:1 1 auto; display:flex; min-height:0; overflow:hidden; }
.rr-gutter { flex:none; padding:8px 8px 8px 10px; overflow:hidden; text-align:right; white-space:pre; user-select:none; color:var(--rr-muted); background:var(--rr-bg-soft); border-right:1px solid var(--rr-border-soft); font-family:var(--rr-mono); font-size:12px; line-height:18px; }
.rr-stack { position:relative; flex:1 1 auto; min-width:0; }
.rr-highlight, .rr-code { margin:0; padding:8px 12px; border:0; font-family:var(--rr-mono); font-size:12px; line-height:18px; tab-size:2; white-space:pre; overflow:auto; width:100%; height:100%; }
.rr-highlight { position:absolute; inset:0; pointer-events:none; color:inherit; overflow:hidden; }
.rr-code { position:relative; background:transparent; color:transparent; caret-color:var(--rr-fg); resize:none; outline:none; }
.rr-code::selection { background:rgba(10,122,255,.28); }
.rr-tok-comment { color:#6a9955; }
.rr-tok-string { color:#ce9178; }
.rr-tok-number { color:#b5cea8; }
.rr-tok-keyword { color:#c586c0; }
.rr-tok-constant { color:#4fc1ff; }
.rr-tok-operator { color:#d4d4d4; }
.rr-tok-name { color:#dcdcaa; }
.rr-split { flex:none; height:5px; cursor:row-resize; background:var(--rr-bg-soft); border-top:1px solid var(--rr-border-soft); border-bottom:1px solid var(--rr-border-soft); }
.rr-bottom { display:flex; flex:none; min-height:80px; border-top:1px solid var(--rr-border-soft); }
.rr-console { display:flex; flex-direction:column; flex:1 1 55%; min-width:0; min-height:0; }
.rr-pane-head { display:flex; align-items:center; gap:6px; padding:0 8px 0 4px; min-height:24px; flex:none; border-bottom:1px solid var(--rr-border-soft); background:var(--rr-bg-soft); font-size:10.5px; letter-spacing:.04em; color:var(--rr-muted); }
.rr-pane-head .rr-btn { height:20px; padding:0 6px; font-size:10.5px; }
.rr-log { flex:1 1 auto; overflow:auto; padding:6px 10px 10px; font-family:var(--rr-mono); font-size:11.5px; line-height:17px; }
.rr-entry + .rr-entry { margin-top:8px; padding-top:8px; border-top:1px dashed var(--rr-border-soft); }
.rr-entry-head { display:flex; align-items:center; gap:6px; color:var(--rr-muted); font-size:10.5px; margin-bottom:2px; }
.rr-entry-head b { font-weight:600; color:inherit; }
.rr-out { white-space:pre-wrap; word-break:break-word; }
.rr-out-err { color:#e5534b; }
.rr-empty { color:var(--rr-muted); }
.rr-vars { display:flex; flex-direction:column; flex:1 1 45%; min-width:0; border-left:1px solid var(--rr-border-soft); }
.rr-vars-scroll { flex:1 1 auto; overflow:auto; }
.rr-vtl { display:grid; grid-template-columns:minmax(0,.9fr) minmax(0,1.15fr) 56px 44px 22px; gap:0 8px; padding:3px 8px; font-size:11px; align-items:center; border-bottom:1px solid var(--rr-border-soft); text-align:left; background:transparent; color:inherit; border-left:0; border-right:0; border-top:0; font-family:inherit; width:100%; cursor:default; }
.rr-vtl[data-head="true"] { color:var(--rr-muted); font-size:10px; text-transform:uppercase; letter-spacing:.03em; position:sticky; top:0; background:var(--rr-bg-soft); z-index:1; }
.rr-vtl[data-body="true"] { cursor:pointer; }
.rr-vtl[data-body="true"]:hover { background:var(--rr-bg-hover); }
.rr-vtl span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rr-vtable { text-align:center; color:var(--rr-muted); cursor:pointer; border-radius:3px; font-size:10px; }
.rr-vtable:hover { color:var(--rr-accent); background:var(--rr-bg-hover); }
.rr-tabs { display:flex; align-items:center; gap:2px; flex:none; padding:0; }
.rr-tabbtn { height:24px; padding:0 9px; border:0; border-bottom:2px solid transparent; background:transparent; color:var(--rr-muted); font:inherit; font-size:11px; cursor:pointer; white-space:nowrap; }
.rr-tabbtn[data-active="true"] { color:inherit; border-bottom-color:var(--rr-accent); }
.rr-tabbtn:hover { background:var(--rr-bg-hover); }
.rr-prompt { display:flex; align-items:flex-start; gap:6px; flex:none; padding:4px 8px 6px; border-top:1px solid var(--rr-border-soft); background:var(--rr-bg-soft); }
.rr-prompt-sign { color:var(--rr-accent); font-family:var(--rr-mono); font-size:12px; line-height:20px; }
.rr-prompt-input { flex:1 1 auto; min-width:0; height:20px; max-height:96px; padding:1px 4px; border:0; background:transparent; color:inherit; font-family:var(--rr-mono); font-size:12px; line-height:20px; resize:none; outline:none; }
.rr-history-list, .rr-data-table, .rr-help { overflow:auto; flex:1 1 auto; min-height:0; }
.rr-history-row { display:flex; align-items:baseline; gap:6px; width:100%; white-space:nowrap; overflow:hidden; text-align:left; border:0; border-bottom:1px solid var(--rr-border-soft); background:transparent; color:inherit; font:inherit; cursor:pointer; padding:3px 8px; font-family:var(--rr-mono); font-size:11px; }
.rr-history-row:hover { background:var(--rr-bg-hover); }
.rr-history-row[data-failed="true"] { color:#d9534f; }
.rr-history-meta { color:var(--rr-muted); font-size:10px; margin-left:auto; padding-left:6px; font-family:inherit; flex:none; }
.rr-data-table table { border-collapse:collapse; width:100%; font-family:var(--rr-mono); font-size:10.5px; }
.rr-data-table th, .rr-data-table td { border-bottom:1px solid var(--rr-border-soft); padding:2px 6px; text-align:left; white-space:nowrap; max-width:220px; overflow:hidden; text-overflow:ellipsis; }
.rr-data-table th { position:sticky; top:0; background:var(--rr-bg-soft); font-weight:600; cursor:pointer; user-select:none; }
.rr-data-table th[data-sorted] { color:var(--rr-accent); }
.rr-data-table td[data-num="true"] { text-align:right; }
.rr-help pre { margin:0; padding:6px 8px; white-space:pre-wrap; font-family:var(--rr-mono); font-size:11px; }
.rr-help-bar { display:flex; align-items:center; gap:6px; flex:none; padding:4px 8px; border-bottom:1px solid var(--rr-border-soft); }
.rr-vtl .rr-vval { font-family:var(--rr-mono); font-size:10.5px; color:var(--rr-muted); }
.rr-plots { display:flex; align-items:flex-start; gap:8px; overflow-x:auto; padding:6px 8px; flex:none; border-top:1px solid var(--rr-border-soft); background:var(--rr-bg-soft); min-height:0; }
.rr-plots-empty { color:var(--rr-muted); font-size:11px; }
.rr-thumb { display:flex; flex-direction:column; gap:2px; flex:none; width:104px; border:1px solid var(--rr-border-soft); border-radius:5px; overflow:hidden; background:rgba(127,127,127,.05); }
.rr-thumb img { width:100%; height:64px; object-fit:contain; background:#fff; display:block; }
.rr-thumb-name { font-size:9.5px; padding:0 4px 3px; color:var(--rr-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rr-thumb { cursor:zoom-in; padding:0; border-radius:5px; text-align:left; color:inherit; font:inherit; }
.rr-thumb:hover { border-color:var(--rr-accent); }
.rr-thumb:focus-visible { outline:2px solid var(--rr-accent); outline-offset:1px; }
.rr-plotview { display:flex; flex-direction:column; flex:1 1 auto; min-height:0; min-width:0; overflow:hidden; background:var(--rr-bg-soft); }
.rr-lb-bar { display:flex; align-items:center; gap:6px; padding:5px 8px; flex:none; flex-wrap:wrap; border-bottom:1px solid var(--rr-border); background:var(--rr-bg-soft); }
.rr-lb-title { flex:1 1 60px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--rr-mono); font-size:11px; color:var(--rr-muted); }
.rr-lb-btn { display:inline-flex; align-items:center; justify-content:center; height:24px; min-width:24px; padding:0 8px; border-radius:5px; border:1px solid var(--rr-border); background:transparent; color:inherit; font:inherit; font-size:11.5px; cursor:pointer; white-space:nowrap; }
.rr-lb-btn:hover { background:var(--rr-bg-hover); }
.rr-lb-btn[data-on="true"] { background:var(--rr-accent); border-color:var(--rr-accent); color:#fff; }
.rr-lb-stage { position:relative; flex:1 1 auto; min-height:0; min-width:0; overflow:auto; padding:0; background:var(--rr-bg-soft); }
.rr-lb-stage img { display:block; background:#fff; border-radius:3px; box-shadow:0 4px 18px rgba(0,0,0,.18); }
.rr-lb-stage[data-zoom="fit"] img { position:absolute; inset:10px; width:calc(100% - 20px); height:calc(100% - 20px); object-fit:contain; box-shadow:none; }
.rr-lb-stage[data-zoom="full"] img { position:absolute; left:10px; top:10px; width:auto; height:auto; max-width:none; max-height:none; }
.rr-lb-hint { flex:none; color:var(--rr-muted); font-size:10.5px; padding:4px 8px 6px; text-align:center; border-top:1px solid var(--rr-border-soft); }
.rr-status { display:flex; align-items:center; gap:8px; padding:2px 8px; flex:none; border-top:1px solid var(--rr-border-soft); font-size:10.5px; color:var(--rr-muted); }
.rr-status .rr-spacer { flex:1 1 auto; }
.rr-settings { flex:1 1 auto; overflow:auto; padding:12px 14px 24px; }
.rr-section { margin-bottom:18px; }
.rr-section h4 { margin:0 0 8px; font-size:10.5px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--rr-muted); }
.rr-row { display:grid; grid-template-columns:170px minmax(0,1fr); gap:10px; align-items:center; padding:3px 0; }
.rr-row-label { font-size:11.5px; color:var(--rr-muted); }
.rr-row input[type="text"], .rr-row input[type="number"], .rr-row select, .rr-row textarea { width:100%; height:26px; padding:2px 7px; border-radius:5px; border:1px solid var(--rr-border); background:transparent; color:inherit; font:inherit; font-size:11.5px; }
.rr-row select, .rr-roots select { height:26px; border-radius:5px; border:1px solid var(--rr-border); background:transparent; color:inherit; font:inherit; font-size:11.5px; padding:0 6px; }
.rr-row textarea { height:64px; padding:5px 7px; font-family:var(--rr-mono); font-size:11px; resize:vertical; }
.rr-row input:focus-visible, .rr-row select:focus-visible, .rr-row textarea:focus-visible { outline:1px solid var(--rr-accent); outline-offset:0; }
.rr-check { display:flex; align-items:center; gap:6px; padding:3px 0; font-size:11.5px; color:var(--rr-muted); }
.rr-actions { display:flex; gap:6px; padding-top:4px; }
.rr-hint { font-size:11px; color:var(--rr-muted); padding:2px 0; }
.rr-roots { display:flex; flex-direction:column; gap:5px; }
.rr-root-row { display:flex; align-items:center; gap:6px; padding:3px 6px; border:1px solid var(--rr-border-soft); border-radius:5px; font-family:var(--rr-mono); font-size:10.5px; }
.rr-root-row span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1 1 auto; }
.rr-roots > .rr-btn { align-self:flex-start; }
.rr-pick-portal { position:fixed; inset:0; z-index:9998; display:flex; align-items:center; justify-content:center; background:rgba(5,7,10,.42); }
.rr-pick-card { width:min(580px,94vw); max-height:min(600px,88vh); display:flex; flex-direction:column; border-radius:12px; background:var(--rr-bg, #fff); color:inherit; border:1px solid var(--rr-border); box-shadow:0 24px 60px rgba(0,0,0,.30); overflow:hidden; font-family:-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }
.rr-pick-head { display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid var(--rr-border-soft); }
.rr-pick-title { font-weight:600; font-size:12px; white-space:nowrap; }
.rr-pick-path { font-family:var(--rr-mono); font-size:11px; color:var(--rr-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1 1 auto; min-width:0; }
.rr-pick-list { overflow:auto; padding:4px; flex:1 1 auto; min-height:140px; }
.rr-pick-row { display:flex; align-items:center; gap:8px; padding:4px 8px; border-radius:5px; cursor:pointer; font-size:12px; color:inherit; }
.rr-pick-row:hover { background:var(--rr-bg-hover); }
.rr-pick-row[data-here="true"] { color:var(--rr-accent); font-weight:600; }
.rr-pick-empty { padding:14px 10px; font-size:11.5px; color:var(--rr-muted); }
.rr-pick-foot { display:flex; gap:6px; justify-content:flex-end; padding:8px 10px; border-top:1px solid var(--rr-border-soft); background:var(--rr-bg-soft, rgba(127,127,127,.07)); }
.rr-modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.42); display:flex; align-items:center; justify-content:center; z-index:60; }
.rr-modal { width:min(440px, 88vw); border-radius:8px; border:1px solid var(--rr-border); background:canvas; color:inherit; padding:14px 16px; box-shadow:0 12px 40px rgba(0,0,0,.35); }
.rr-modal h3 { margin:0 0 6px; font-size:13px; }
.rr-modal p { margin:0 0 8px; font-size:11.5px; color:var(--rr-muted); }
.rr-modal input { width:100%; height:28px; padding:3px 8px; border-radius:5px; border:1px solid var(--rr-border); background:transparent; color:inherit; font:inherit; font-size:12px; font-family:var(--rr-mono); }

/* ---------------------------------------------------------------- polish */
/* One button system everywhere: same height, radius, border, states. */
.rr-btn, .rr-lb-btn { -webkit-appearance:none; appearance:none; display:inline-flex; align-items:center; justify-content:center; gap:5px; height:24px; padding:0 10px; border-radius:6px; border:1px solid var(--rr-border); background:transparent; color:inherit; font:inherit; font-size:11.5px; font-weight:500; line-height:1; cursor:pointer; white-space:nowrap; text-decoration:none; transition:background .12s ease, border-color .12s ease, color .12s ease, box-shadow .12s ease; }
.rr-btn:hover:not(:disabled), .rr-lb-btn:hover { background:var(--rr-bg-hover); border-color:rgba(127,127,127,.46); }
.rr-btn:active:not(:disabled), .rr-lb-btn:active { transform:translateY(.5px); }
.rr-btn:focus-visible, .rr-lb-btn:focus-visible { outline:2px solid rgba(10,122,255,.45); outline-offset:1px; }
.rr-btn:disabled { opacity:.42; cursor:default; }
.rr-btn[data-primary="true"] { background:var(--rr-accent); border-color:var(--rr-accent); color:#fff; box-shadow:0 1px 2px rgba(10,122,255,.32); }
.rr-btn[data-primary="true"]:hover:not(:disabled) { background:#1a86ff; filter:none; }
.rr-btn[data-on="true"], .rr-lb-btn[data-on="true"] { background:rgba(10,122,255,.14); border-color:rgba(10,122,255,.42); color:var(--rr-accent); }
.rr-lb-btn[data-icon="true"] { width:24px; padding:0; font-size:13px; }
.rr-linkbtn { background:none; border:0; padding:0; color:var(--rr-muted); font:inherit; font-size:10.5px; cursor:pointer; }
.rr-linkbtn:hover { color:var(--rr-fg); text-decoration:underline; }
.rr-toolbar { padding:6px 8px; gap:5px; }
.rr-group { gap:3px; }
.rr-group + .rr-group { border-left:1px solid var(--rr-border-soft); padding-left:7px; margin-left:3px; }
.rr-tabbtn { -webkit-appearance:none; appearance:none; height:24px; margin:3px 2px; padding:0 10px; border:1px solid transparent; border-radius:5px; background:transparent; color:var(--rr-muted); font:inherit; font-size:11px; font-weight:500; cursor:pointer; white-space:nowrap; transition:background .12s ease, color .12s ease; }
.rr-tabbtn:hover { background:var(--rr-bg-hover); color:inherit; }
.rr-tabbtn[data-active="true"] { background:var(--rr-bg); color:var(--rr-fg); box-shadow:inset 0 0 0 1px var(--rr-border), 0 1px 2px rgba(0,0,0,.06); }
.rr-tabbtn:focus-visible { outline:2px solid rgba(10,122,255,.4); outline-offset:0; }
.rr-tabs { padding:1px 2px; }
.rr-entry { padding:4px 10px; border-left:2px solid transparent; border-bottom:1px solid var(--rr-border-soft); }
.rr-entry[data-kind="error"] { border-left-color:#d9534f; background:rgba(217,83,79,.055); }
.rr-entry-head { display:flex; align-items:baseline; gap:8px; font-size:10.5px; color:var(--rr-muted); margin-bottom:2px; }
.rr-entry-head b { color:var(--rr-fg); font-weight:600; }
.rr-empty { padding:10px 12px; color:var(--rr-muted); font-size:11.5px; line-height:1.5; }
.rr-thumb { position:relative; display:flex; flex-direction:column; gap:3px; flex:none; padding:3px; border:1px solid var(--rr-border); border-radius:7px; background:var(--rr-bg); cursor:zoom-in; }
.rr-thumb img { width:104px; height:70px; object-fit:cover; border-radius:4px; display:block; background:#fff; border:1px solid var(--rr-border); }
.rr-thumb-name { font-size:9px; color:var(--rr-muted); max-width:104px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:left; }
.rr-thumb:hover { border-color:var(--rr-accent); }
.rr-thumb-del { position:absolute; top:-7px; right:-7px; width:18px; height:18px; padding:0; border-radius:50%; border:1px solid var(--rr-border); background:var(--rr-bg); color:var(--rr-muted); font-size:11px; line-height:1; cursor:pointer; opacity:0; transition:opacity .12s ease; }
.rr-thumb:hover .rr-thumb-del { opacity:1; }
.rr-thumb-del:hover { color:#d9534f; border-color:#d9534f; }
.rr-gline { display:flex; align-items:center; justify-content:flex-end; gap:4px; height:18px; line-height:18px; }
.rr-gnum { opacity:.85; }
.rr-gdot { width:6px; height:6px; border-radius:50%; flex:none; }
.rr-gdot-error { background:#e5534b; }
.rr-gdot-warning { background:#dd9b2b; }
.rr-gdot-info { background:#4b9be5; }
.rr-problems { color:#e5534b; font-variant-numeric:tabular-nums; }
.rr-complete { position:absolute; z-index:20; min-width:200px; max-width:340px; max-height:224px; overflow:auto; padding:4px; border:1px solid var(--rr-border); border-radius:8px; background:var(--rr-bg); box-shadow:0 12px 32px rgba(0,0,0,.22); font-size:11.5px; }
.rr-complete-head { display:flex; align-items:center; gap:6px; padding:2px 6px 4px; color:var(--rr-muted); font-size:10px; border-bottom:1px solid var(--rr-border-soft); }
.rr-complete-hint { font-size:9.5px; opacity:.85; }
.rr-complete-row { display:flex; align-items:center; gap:6px; padding:3px 6px; border-radius:5px; cursor:pointer; white-space:nowrap; }
.rr-complete-row[data-active="true"] { background:rgba(10,122,255,.14); }
.rr-complete-kind { width:16px; color:var(--rr-muted); font-size:10px; text-align:center; }
.rr-complete-label { font-family:var(--rr-mono); }
.rr-complete-pkg { margin-left:auto; color:var(--rr-muted); font-size:9.5px; }
.rr-pkgs { display:flex; flex-direction:column; flex:1 1 auto; min-height:0; }
.rr-pkg-cols { display:flex; gap:10px; flex:1 1 auto; min-height:0; padding:0 8px; }
.rr-pkg-col { flex:1 1 50%; min-width:0; display:flex; flex-direction:column; }
.rr-pkg-head { display:flex; align-items:center; gap:6px; padding:4px 2px; color:var(--rr-muted); font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; border-bottom:1px solid var(--rr-border-soft); }
.rr-pkg-list { flex:1 1 auto; min-height:0; overflow:auto; }
.rr-pkg-row { display:flex; align-items:center; gap:6px; padding:2px 2px; font-size:11px; border-bottom:1px solid var(--rr-border-soft); }
.rr-pkg-row:hover { background:var(--rr-bg-hover); }
.rr-pkg-name { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--rr-mono); }
.rr-pkg-ver { color:var(--rr-muted); font-size:10px; font-variant-numeric:tabular-nums; }
.rr-pkg-install { display:flex; align-items:center; gap:8px; padding:6px 8px; border-top:1px solid var(--rr-border-soft); }
.rr-pkg-log { margin:0; padding:6px 10px; max-height:120px; overflow:auto; font-family:var(--rr-mono); font-size:10.5px; white-space:pre-wrap; border-top:1px solid var(--rr-border-soft); background:var(--rr-bg-soft); }
.rr-hint-warn { color:#c98500; }
.rr-gridview, .rr-rmd { display:flex; flex-direction:column; flex:1 1 auto; min-height:0; }
.rr-grid-bar { display:flex; align-items:center; gap:8px; padding:6px 8px; border-bottom:1px solid var(--rr-border-soft); }
.rr-grid { flex:1 1 auto; min-height:0; overflow:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:10px; padding:10px; align-content:start; }
.rr-grid-cell { display:flex; flex-direction:column; gap:4px; }
.rr-grid-thumb { padding:4px; border:1px solid var(--rr-border); border-radius:8px; background:var(--rr-bg); cursor:zoom-in; }
.rr-grid-thumb:hover { border-color:var(--rr-accent); }
.rr-grid-thumb img { width:100%; height:118px; object-fit:contain; background:#fff; border-radius:5px; display:block; }
.rr-grid-meta { display:flex; align-items:center; gap:6px; font-size:10px; color:var(--rr-muted); }
.rr-grid-meta span { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rr-rmd-error { display:flex; flex-direction:column; gap:6px; padding:8px; min-height:0; overflow:auto; }
.rr-rmd-frame { flex:1 1 auto; width:100%; min-height:0; border:0; background:#fff; }
.rr-thumb-wrap { position:relative; flex:none; }
.rr-thumb-wrap .rr-thumb { padding:0; border:0; background:transparent; }
.rr-plots-strip { display:flex; align-items:flex-start; gap:8px; flex:1 1 auto; min-width:0; overflow-x:auto; padding:6px 8px; }
.rr-plots { display:flex; align-items:center; gap:8px; flex:none; border-top:1px solid var(--rr-border-soft); background:var(--rr-bg-soft); }
.rr-plots-clear { flex:none; margin-right:10px; }
.rr-vtl { grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) 46px 38px 18px; gap:0 6px; font-size:10.5px; padding:2px 8px; }
.rr-vtable { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:4px; color:var(--rr-muted); cursor:pointer; font-size:9.5px; }
.rr-vtable:hover { color:var(--rr-accent); background:rgba(10,122,255,.14); }
.rr-lb-portal { position:fixed; inset:0; z-index:2147483000; display:flex; align-items:center; justify-content:center; padding:28px; background:rgba(10,13,18,.48); backdrop-filter:blur(3px); }
.rr-lb-card { display:flex; flex-direction:column; width:min(1080px,94vw); height:min(720px,90vh); background:var(--rr-bg-elev, var(--rr-bg)); color:var(--rr-fg, inherit); border:1px solid var(--rr-border); border-radius:14px; box-shadow:0 30px 80px rgba(0,0,0,.42); overflow:hidden; animation:rr-pop .15s ease-out; }
@keyframes rr-pop { from { opacity:0; transform:scale(.985) } to { opacity:1; transform:none } }
.rr-lb-card .rr-lb-bar { padding:8px 10px; gap:6px; background:var(--rr-bg-soft); }
.rr-lb-canvas { position:relative; flex:1 1 auto; min-height:0; display:flex; align-items:center; justify-content:center; padding:14px; background:var(--rr-bg-soft); }
.rr-lb-canvas img { max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; background:#fff; border-radius:2px; box-shadow:0 6px 22px rgba(0,0,0,.16); }
.rr-lb-canvas[data-zoom="full"] { overflow:auto; align-items:flex-start; justify-content:flex-start; }
.rr-lb-canvas[data-zoom="full"] img { max-width:none; max-height:none; }
.rr-lb-zoom { display:flex; align-items:center; gap:4px; padding:0 6px; border:1px solid var(--rr-border); border-radius:6px; height:24px; }
.rr-lb-range { width:110px; height:14px; accent-color:var(--rr-accent); }
.rr-lb-zoomval { min-width:34px; text-align:right; font-size:10.5px; color:var(--rr-muted); font-variant-numeric:tabular-nums; }
.rr-lb-grip { position:absolute; right:2px; bottom:2px; width:16px; height:16px; cursor:nwse-resize; background:linear-gradient(135deg, transparent 45%, var(--rr-border) 45%, var(--rr-border) 55%, transparent 55%, transparent 70%, var(--rr-border) 70%, var(--rr-border) 80%, transparent 80%); border-radius:0 0 8px 0; }
.rr-lb-card { position:relative; }
.rr-lb-foot { flex:none; padding:5px 10px; border-top:1px solid var(--rr-border-soft); font-size:10.5px; color:var(--rr-muted); }

`

    function ensureStyles() {
      const id = 'dsh-r-runner-style'
      if (document.getElementById(id) !== null) return
      const style = document.createElement('style')
      style.id = id
      style.textContent = CSS
      document.head.appendChild(style)
    }

    // ---------------------------------------------------------------- helpers

    function basename(path) {
      const parts = String(path).split('/')
      return parts[parts.length - 1] || path
    }

    function dirname(path) {
      const parts = String(path).split('/')
      parts.pop()
      return parts.join('/') || '/'
    }

    function formatMs(ms) {
      if (!Number.isFinite(ms)) return '—'
      if (ms < 1000) return `${Math.round(ms)} ms`
      return `${(ms / 1000).toFixed(2)} s`
    }

    /** The ```{r} chunk that contains `offset`, for knitting-style Rmd buffers. */
    function chunkAt(source, offset) {
      const lines = source.split('\n')
      let pos = 0
      let current = null
      let index = 0
      for (let line = 0; line < lines.length; line += 1) {
        const start = pos
        pos += lines[line].length + 1
        const head = /^\s*```+\s*\{([A-Za-z0-9_.-]*)/.exec(lines[line])
        if (current === null && head !== null) {
          current = { start: line + 1, engine: head[1], end: lines.length, at: start }
        } else if (current !== null && /^\s*```+\s*$/.test(lines[line])) {
          index += 1
          current.end = line
          current.index = index
          current.total = null
          if (offset >= current.at && offset <= pos) return finish(current, lines)
          current = null
        }
      }
      return null

      function finish(chunk, all) {
        const body = all.slice(chunk.start, chunk.end).join('\n')
        if (body.trim() === '') return null
        return { code: body, engine: chunk.engine, index: chunk.index, from: chunk.start + 1, to: chunk.end }
      }
    }

    function countChunks(source) {
      return (source.match(/^\s*```+\s*\{[A-Za-z0-9_.-]*/gm) ?? []).length
    }

    function clock(at) {
      const date = new Date(at)
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
    }

    function highlightLayer(code, ref) {
      const lines = code.split('\n')
      return h('pre', { className: 'rr-highlight', ref, 'aria-hidden': true },
        lines.map((line, index) => h('div', { key: index },
          tokenizeLine(line).map((token, tokenIndex) => token.kind === 'plain'
            ? token.text
            : h('span', { key: tokenIndex, className: `rr-tok-${token.kind}` }, token.text)))))
    }

    // ------------------------------------------------------------------- body

    // Panel chrome in both languages. `handlers` (R semantics) stay as they are;
    // this covers the shell: toolbar, tabs, headers, the plot window, status.
    const UI = {
      zh: {
        run: '▶ 运行', running: '运行中…', runAll: '运行全部', save: '保存', restart: '重启会话',
        stop: '停止', newScript: '＋ 新建', knit: '预览 Rmd', knitting: '渲染中…', plots: '图形',
        settings: '设置', back: '返回编辑器', console: '控制台', history: '历史', help: '帮助',
        data: '数据', packages: '包', environment: '环境', refresh: '刷新', clear: '清空',
        files: '文件', addFolder: '＋ 添加文件夹', remove: '移除', look: '查看',
        emptyConsole: '还没有输出。在下面敲 R 命令，或写进编辑器按 ⌘/Ctrl+Enter 运行。',
        emptyHistory: '还没有运行记录。每次运行都会记在这里，点一行填回控制台。',
        emptyHelp: '输入函数名查文档（等价于 R 里的 ?fun），结果显示在这里。',
        emptyData: '看数据框/矩阵：点环境表里的「表」按钮，或在这里输入对象名。',
        emptyPlots: '运行带 plot 的代码后，图会出现在这里。',
        promptPlaceholder: '输入 R 命令，Enter 运行（↑↓ 翻历史，Shift+Enter 换行）',
        helpPlaceholder: '函数或主题，例如 lm、ggplot2::aes',
        dataPlaceholder: '对象名，例如 df', filterPlaceholder: '筛选…',
        loadedPackages: '已载入', installedPackages: '已安装', install: '安装',
        installing: '安装中…', pkgFilterPlaceholder: '按名字筛选已安装的包',
        installPlaceholder: '包名，例如 tidyverse', close: '关闭', prev: '上一张', next: '下一张',
        fit: '适应', actual: '100%', openOriginal: '打开原图', copyPath: '路径', delete: '删除',
        plotHint: 'Esc 关闭 · ← → 切换 · 0 适应窗口 · 拖动右下角改变窗口大小',
        sessionRunning: '会话', sessionStopped: '会话未启动', noDefinition: '找不到定义',
        saveConfig: '保存配置', restoreDefaults: '恢复默认', language: '界面语言',
        code: '代码', saving: '保存与草稿', workspace: '工作区', execution: '执行',
        plotsSection: '图形', envSection: '环境变量', info: '信息',
        problems: '个问题', completions: '建议', namespaceItems: '包的导出', fieldItems: '字段',
        folders: '文件夹', variables: '变量', loading: '加载中…', noPackages: '还没有加载包信息。',
        name: '名称', value: '值', type: '类型', size: '大小', table: '表',
        cancel: '取消', chooseDir: '选择目录', browse: '浏览…', followSession: '跟随当前会话',
        pickFolder: '添加文件夹', pickWorkdir: '选择工作目录', useThisDir: '用这个目录',
        addThisFolder: '添加此文件夹', noSubfolders: '（没有子文件夹）', parentDir: '上一级',
        homeDir: '主目录', currentWorkdir: '工作区'
      },
      en: {
        run: '▶ Run', running: 'Running…', runAll: 'Run all', save: 'Save', restart: 'Restart',
        stop: 'Stop', newScript: '＋ New', knit: 'Preview Rmd', knitting: 'Rendering…', plots: 'Plots',
        settings: 'Settings', back: 'Back to editor', console: 'Console', history: 'History',
        help: 'Help', data: 'Data', packages: 'Packages', environment: 'Environment',
        refresh: 'Refresh', clear: 'Clear', files: 'Files', addFolder: '＋ Add folder', remove: 'Remove',
        look: 'Show',
        emptyConsole: 'No output yet. Type an R command below, or run the editor with ⌘/Ctrl+Enter.',
        emptyHistory: 'No runs recorded yet. Every run lands here; click a row to put it back in the prompt.',
        emptyHelp: 'Type a function name to read its help page (like ?fun in R).',
        emptyData: 'Inspect a data frame or matrix: the 表 button in the environment, or type its name here.',
        emptyPlots: 'Run code that draws a plot and the images show up here.',
        promptPlaceholder: 'R command, Enter to run (↑↓ history, Shift+Enter newline)',
        helpPlaceholder: 'Function or topic, e.g. lm, ggplot2::aes',
        dataPlaceholder: 'Object name, e.g. df', filterPlaceholder: 'Filter…',
        loadedPackages: 'Loaded', installedPackages: 'Installed', install: 'Install',
        installing: 'Installing…', pkgFilterPlaceholder: 'Filter installed packages by name',
        installPlaceholder: 'Package name, e.g. tidyverse', close: 'Close', prev: 'Previous', next: 'Next',
        fit: 'Fit', actual: '100%', openOriginal: 'Open PNG', copyPath: 'Path', delete: 'Delete',
        plotHint: 'Esc closes · ← → switch · 0 fits · drag the bottom-right corner to resize',
        sessionRunning: 'Session', sessionStopped: 'Session not running', noDefinition: 'no definition found',
        saveConfig: 'Save config', restoreDefaults: 'Restore defaults', language: 'Language',
        code: 'Code', saving: 'Saving & drafts', workspace: 'Workspace', execution: 'Execution',
        plotsSection: 'Plots', envSection: 'Environment variables', info: 'Info',
        problems: 'problems', completions: 'Suggestions', namespaceItems: 'Exports', fieldItems: 'Fields',
        folders: 'Folders', variables: 'Variables', loading: 'Loading…', noPackages: 'No package data loaded yet.',
        name: 'Name', value: 'Value', type: 'Type', size: 'Size', table: 'View',
        cancel: 'Cancel', chooseDir: 'Choose folder', browse: 'Browse…', followSession: 'Follow the session',
        pickFolder: 'Add folder', pickWorkdir: 'Choose the working directory', useThisDir: 'Use this folder',
        addThisFolder: 'Add this folder', noSubfolders: '(no sub-folders)', parentDir: 'Up one level',
        homeDir: 'Home', currentWorkdir: 'Workspace'
      }
    }

    function Body(props) {
      ensureStyles()
      const initialView = typeof props?.initialView === 'string' ? props.initialView : 'code'
      const LANG_KEY = 'dsh.r-runner.lang'
      const [lang, setLang] = react.useState(() => props.preview?.lang ?? localStorage.getItem(LANG_KEY) ?? 'zh')
      const L = (key) => (UI[lang] ?? UI.zh)[key] ?? UI.zh[key] ?? key
      const [view, setView] = react.useState(initialView)
      const [config, setConfig] = react.useState(null)
      const [draft, setDraft] = react.useState(null)
      const [probe, setProbe] = react.useState(null)
      const [status, setStatus] = react.useState({ running: false, pid: null, uptimeMs: 0 })
      const [buffers, setBuffers] = react.useState(() => readBuffers())
      const [activeKey, setActiveKey] = react.useState(() => localStorage.getItem(ACTIVE_KEY) ?? '')
      const [tree, setTree] = react.useState(null)
      const [treePath, setTreePath] = react.useState(null)
      const [treeOpen, setTreeOpen] = react.useState(() => readFlag(TREE_OPEN_KEY, true))
      const [varsOpen, setVarsOpen] = react.useState(() => readFlag(VARS_OPEN_KEY, true))
      const [vars, setVars] = react.useState([])
      const [log, setLog] = react.useState([])
      const [plots, setPlots] = react.useState([])
      const [running, setRunning] = react.useState(false)
      const [message, setMessage] = react.useState('')
      const [editing, setEditing] = react.useState(null)
      const [picker, setPicker] = react.useState(() => props.preview?.picker ?? null)
      const [workspaces, setWorkspaces] = react.useState([])
      const [bottomTab, setBottomTab] = react.useState(() => props.preview?.bottomTab ?? localStorage.getItem(BOTTOM_TAB_KEY) ?? 'console')
      const [cmd, setCmd] = react.useState('')
      const [cmdHistory, setCmdHistory] = react.useState([])
      const [cmdIndex, setCmdIndex] = react.useState(-1)
      const [historyEntries, setHistoryEntries] = react.useState(() => props.preview?.historyEntries ?? [])
      const [helpTopic, setHelpTopic] = react.useState(() => props.preview?.helpTopic ?? '')
      const [helpText, setHelpText] = react.useState(() => props.preview?.helpText ?? '')
      const [helpBusy, setHelpBusy] = react.useState(false)
      const [dataName, setDataName] = react.useState(() => props.preview?.dataName ?? '')
      const [dataTable, setDataTable] = react.useState(() => props.preview?.dataTable ?? null)
      const [dataBusy, setDataBusy] = react.useState(false)
      const [dataFilter, setDataFilter] = react.useState('')
      const [dataSort, setDataSort] = react.useState({ column: -1, direction: 1 })
      const [problems, setProblems] = react.useState(() => props.preview?.problems ?? [])
      const [completion, setCompletion] = react.useState(() => props.preview?.completion ?? null)
      const [gotoBusy, setGotoBusy] = react.useState(false)
      const [showAllPlots, setShowAllPlots] = react.useState(false)
      const [pkgList, setPkgList] = react.useState(() => props.preview?.pkgList ?? null)
      const [pkgFilter, setPkgFilter] = react.useState('')
      const [pkgBusy, setPkgBusy] = react.useState(false)
      const [installName, setInstallName] = react.useState('')
      const [installLog, setInstallLog] = react.useState(() => props.preview?.installLog ?? '')
      const [rmdHtml, setRmdHtml] = react.useState('')
      const [rmdBusy, setRmdBusy] = react.useState(false)
      const [rmdError, setRmdError] = react.useState('')
      const [plotIndex, setPlotIndex] = react.useState(
        typeof props?.initialPlot === 'number' ? props.initialPlot : null)
      const [plotFit, setPlotFit] = react.useState(true)
      const [plotZoom, setPlotZoom] = react.useState(1)
      const [plotNatural, setPlotNatural] = react.useState(null)
      const [plotSize, setPlotSize] = react.useState({ width: 1080, height: 720 })
      const [treeWidth, setTreeWidth] = react.useState(() => readNumber(TREE_WIDTH_KEY, 210))
      const [consoleHeight, setConsoleHeight] = react.useState(() => readNumber(CONSOLE_KEY, 190))
      const [caret, setCaret] = react.useState({ line: 1, col: 1 })
      const [savedAt, setSavedAt] = react.useState(0)

      const highlightRef = react.useRef(null)
      const codeRef = react.useRef(null)
      const gutterRef = react.useRef(null)
      const stateRef = react.useRef({})
      stateRef.current = { config, buffers, activeKey, status }

      const active = buffers[activeKey] ?? null
      const code = active?.code ?? ''
      const lineCount = Math.max(code.split('\n').length, 1)

      const flash = (text) => {
        setMessage(text)
        window.setTimeout(() => setMessage((current) => (current === text ? '' : current)), 2200)
      }

      // ------------------------------------------------------------- bootstrap

      react.useEffect(() => {
        let cancelled = false
        api('state')
          .then((value) => {
            if (cancelled) return
            setProbe(value.probe ?? null)
            setStatus({ running: value.running === true, pid: value.pid ?? null, uptimeMs: value.uptimeMs ?? 0 })
            setConfig(value.config ?? null)
            setDraft(value.config ?? null)
            setPlots(Array.isArray(value.plots) ? value.plots.slice(-12) : [])
            if (value.config?.workdir) setTreePath(value.config.workdir)
            if (Object.keys(readBuffers()).length === 0) {
              seedDefault()
            }
          })
          .catch((error) => {
            if (cancelled) return
            setLog((items) => [...items, { id: `boot-${Date.now()}`, kind: 'error', at: Date.now(), error: String(error.message ?? error) }])
          })
        return () => { cancelled = true }
      }, [])

      function seedDefault() {
        const key = 'draft:sample'
        const next = { [key]: { code: SAMPLE, name: 'scratch', path: null, baseline: SAMPLE, at: Date.now() } }
        setBuffers(next)
        writeBuffers(next)
        setActiveKey(key)
        localStorage.setItem(ACTIVE_KEY, key)
      }

      react.useEffect(() => {
        if (activeKey === '' || buffers[activeKey] !== undefined) return
        const first = Object.keys(buffers)[0]
        if (first !== undefined) setActiveKey(first)
      }, [buffers, activeKey])

      react.useEffect(() => {
        if (picker === null) return undefined
        if (typeof window.addEventListener !== 'function') return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            setPicker(null)
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [picker === null])

      // tree -------------------------------------------------------------

      const loadTree = (path) => {
        const url = path === null || path === undefined ? 'tree' : 'tree?path=' + encodeURIComponent(path)
        api(url)
          .then((value) => {
            setTree(value)
            setTreePath(value.path)
          })
          .catch((error) => flash(String(error.message ?? error)))
      }

      react.useEffect(() => {
        if (treeOpen && treePath !== null) loadTree(treePath)
        else if (treeOpen && config?.workdir) loadTree(config.workdir)
      }, [treeOpen, treePath === null, config?.workdir])

      // refresh the tree when a run may have written files
      const refreshTree = () => {
        if (treeOpen) loadTree(treePath ?? undefined)
      }

      react.useEffect(() => {
        if (props.preview !== undefined) return
        loadWorkspaces()
      }, [])

      // variables ---------------------------------------------------------

      const refreshVars = () => {
        api('vars')
          .then((value) => setVars(Array.isArray(value.variables) ? value.variables : []))
          .catch(() => setVars([]))
      }

      react.useEffect(() => {
        if (varsOpen) refreshVars()
      }, [varsOpen, savedAt])

      // persistence -------------------------------------------------------

      react.useEffect(() => {
        writeBuffers(buffers)
      }, [buffers])

      react.useEffect(() => {
        if (activeKey !== '') localStorage.setItem(ACTIVE_KEY, activeKey)
      }, [activeKey])

      react.useEffect(() => {
        writeFlag(TREE_OPEN_KEY, treeOpen)
      }, [treeOpen])

      react.useEffect(() => {
        writeFlag(VARS_OPEN_KEY, varsOpen)
      }, [varsOpen])

      react.useEffect(() => {
        localStorage.setItem(CONSOLE_KEY, String(Math.round(consoleHeight)))
      }, [consoleHeight])

      react.useEffect(() => {
        localStorage.setItem(BOTTOM_TAB_KEY, bottomTab)
      }, [bottomTab])

      react.useEffect(() => {
        localStorage.setItem(LANG_KEY, lang)
      }, [lang])

      const loadHistory = () => {
        api('history')
          .then((value) => setHistoryEntries(Array.isArray(value.entries) ? value.entries : []))
          .catch(() => setHistoryEntries([]))
      }

      react.useEffect(() => {
        if (props.preview !== undefined) return
        if (bottomTab === 'history') loadHistory()
      }, [bottomTab, savedAt])

      react.useEffect(() => {
        localStorage.setItem(TREE_WIDTH_KEY, String(Math.round(treeWidth)))
      }, [treeWidth])

      react.useEffect(() => {
        if (props.preview !== undefined) return
        if (activeKey === '') return
        const text = code
        const timer = setTimeout(() => {
          api('diagnose', { method: 'POST', body: { code: text } })
            .then((value) => setProblems(Array.isArray(value.problems) ? value.problems : []))
            .catch(() => setProblems([]))
        }, 700)
        return () => clearTimeout(timer)
      }, [activeKey, code])

      // ------------------------------------------------------------ code intel

      /** Where the caret sits, in px, inside the code area (mono 12/18). */
      const caretBox = (textarea) => {
        if (textarea === null) return { left: PAD, top: LINE_H }
        const upto = textarea.value.slice(0, textarea.selectionStart)
        const lines = upto.split('\n')
        return {
          left: PAD + lines[lines.length - 1].length * CHAR_W,
          top: (lines.length - 1) * LINE_H - textarea.scrollTop + LINE_H
        }
      }

      const tokenBeforeCaret = (textarea) => {
        if (textarea === null) return { word: '', line: '', start: 0, end: 0 }
        const upto = textarea.value.slice(0, textarea.selectionStart)
        const line = upto.split('\n').pop() ?? ''
        const match = /[A-Za-z._][A-Za-z0-9._]*$/.exec(line)
        if (match === null) return { word: '', line, start: textarea.selectionStart, end: textarea.selectionStart }
        return {
          word: match[0],
          line,
          start: textarea.selectionStart - match[0].length,
          end: textarea.selectionStart
        }
      }

      const openCompletion = () => {
        const textarea = codeRef.current
        if (textarea === null) return
        const { line, start, end } = tokenBeforeCaret(textarea)
        api('complete?line=' + encodeURIComponent(line))
          .then((value) => {
            const items = Array.isArray(value.items) ? value.items : []
            if (items.length === 0) {
              setCompletion(null)
              return
            }
            const box = caretBox(textarea)
            setCompletion({ items, index: 0, prefix: value.prefix ?? '', start, end, left: box.left, top: box.top, mode: value.mode })
          })
          .catch((error) => flash(String(error.message ?? error)))
      }

      const applyCompletion = (item, textarea) => {
        const target = textarea ?? codeRef.current
        if (completion === null || target === null || item === undefined) return
        const before = active.code.slice(0, completion.start)
        const after = active.code.slice(completion.end)
        const next = `${before}${item.label}${after}`
        setCode(next)
        setCompletion(null)
        const caret = completion.start + item.label.length
        window.requestAnimationFrame(() => {
          target.focus()
          target.selectionStart = caret
          target.selectionEnd = caret
        })
      }

      const gotoDefinition = () => {
        const textarea = codeRef.current
        const { word } = tokenBeforeCaret(textarea)
        if (word === '') return
        setGotoBusy(true)
        api('definition?name=' + encodeURIComponent(word))
          .then((value) => {
            if (value.file !== null && value.file !== undefined && value.file !== '') {
              const root = String(config?.workdir ?? '')
              if (root !== '' && !String(value.file).startsWith(root)) {
                flash(`${word} 定义在 ${value.file}:${value.line ?? 1}`)
                return
              }
              openPath(value.file)
              const line = Number(value.line ?? 1)
              window.requestAnimationFrame(() => {
                const target = codeRef.current
                if (target === null) return
                const lines = target.value.split('\n')
                const offset = lines.slice(0, Math.max(0, line - 1)).reduce((sum, text) => sum + text.length + 1, 0)
                target.focus()
                target.selectionStart = offset
                target.selectionEnd = offset + lines[Math.max(0, line - 1)].length
              })
              return
            }
            if (value.ok === false) {
              flash(value.error ?? `找不到 ${word} 的定义`)
              return
            }
            flash(`${word}：${value.where ?? ''}${value.signature ? ` · ${value.signature}` : ''}`)
          })
          .catch((error) => flash(String(error.message ?? error)))
          .finally(() => setGotoBusy(false))
      }

      // ------------------------------------------------------------- editing

      const updateBuffer = (key, patch) => {
        setBuffers((current) => ({ ...current, [key]: { ...current[key], ...patch, at: Date.now() } }))
      }

      const setCode = (next) => {
        if (activeKey === '') return
        updateBuffer(activeKey, { code: next })
        localStorage.setItem(CODE_KEY, next)
      }

      const openPath = (path) => {
        const existing = Object.keys(buffers).find((key) => buffers[key]?.path === path)
        if (existing !== undefined) {
          setActiveKey(existing)
          return
        }
        api('file?path=' + encodeURIComponent(path))
          .then((value) => {
            const key = `file:${value.path}`
            setBuffers((current) => ({
              ...current,
              [key]: { code: value.text, name: basename(value.path), path: value.path, baseline: value.text, mtimeMs: value.mtimeMs ?? null, at: Date.now() }
            }))
            setActiveKey(key)
          })
          .catch((error) => flash(String(error.message ?? error)))
      }

      const newDraft = () => {
        const key = `draft:${Date.now()}`
        setBuffers((current) => ({ ...current, [key]: { code: '', name: 'scratch', path: null, baseline: '', at: Date.now() } }))
        setActiveKey(key)
      }

      const closeBuffer = (key) => {
        setBuffers((current) => {
          const next = { ...current }
          delete next[key]
          return next
        })
        if (key === activeKey) {
          const rest = Object.keys(buffers).filter((item) => item !== key)
          setActiveKey(rest[0] ?? '')
        }
      }

      const dirty = active !== null && active.code !== active.baseline

      // ------------------------------------------------------------- running

      const pushEntry = (entry) => {
        setLog((items) => [...items.slice(-40), entry])
      }

      const saveActive = async (silent) => {
        if (active === null) return
        try {
          if (active.path !== null) {
            const value = await api('file', { method: 'POST', body: { path: active.path, text: active.code } })
            updateBuffer(activeKey, { baseline: active.code, mtimeMs: value.mtimeMs ?? null })
          } else {
            const name = active.name === '' || active.name === 'scratch' ? `scratch-${Date.now().toString().slice(-5)}` : active.name
            const value = await api('save', { method: 'POST', body: { name, text: active.code } })
            const key = `file:${value.path}`
            setBuffers((current) => {
              const next = { ...current }
              delete next[activeKey]
              next[key] = { code: current[activeKey].code, name: basename(value.path), path: value.path, baseline: current[activeKey].code, at: Date.now() }
              return next
            })
            setActiveKey(key)
          }
          setSavedAt(Date.now())
          if (silent !== true) flash('已保存')
        } catch (error) {
          flash(String(error.message ?? error))
        }
      }

      const runCode = async (source, label) => {
        if (running) return
        setRunning(true)
        setStatus((current) => ({ ...current, running: true }))
        const started = Date.now()
        try {
          const value = await api('run', { method: 'POST', body: { code: source } })
          setPlots((current) => [...value.plots, ...current].slice(0, 24))
          pushEntry({
            id: `run-${started}`,
            kind: value.ok ? 'run' : 'error',
            label: label ?? 'run',
            at: started,
            ms: value.ms,
            stdout: value.stdout,
            stderr: value.stderr,
            error: value.error,
            plots: value.plots,
            wd: value.wd
          })
          refreshVars()
          refreshTree()
          if (config?.autoSave === true) await saveActive(true)
        } catch (error) {
          pushEntry({ id: `run-${started}`, kind: 'error', label: label ?? 'run', at: started, error: String(error.message ?? error) })
        } finally {
          setRunning(false)
          setStatus((current) => ({ ...current, running: false }))
        }
      }

      const runSelectionOrBuffer = () => {
        const textarea = codeRef.current
        if (textarea !== null && config !== null) {
          const selection = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)
          if (selection.trim() !== '') return runCode(selection, 'selection')
        }
        const isRmdBuffer = /\.[Rr]md$|\.[Qq]md$/.test(String(active?.name ?? active?.path ?? ''))
        if (isRmdBuffer) {
          const source = active.code
          const offset = textarea !== null ? textarea.selectionStart : 0
          const firstFence = source.search(/^\s*```+\s*\{/m)
          const chunk = chunkAt(source, offset)
            ?? (firstFence >= 0 ? chunkAt(source, firstFence + 1) : null)
          if (chunk !== null) {
            const total = countChunks(source)
            return runCode(chunk.code, `chunk ${chunk.index}/${total} · L${chunk.from}-${chunk.to}`)
          }
          flash('这个 Rmd 里没有可运行的 {r} 代码块')
          return
        }
        if (active?.path != null) return runCode(active.code, basename(active.path))
        return runCode(code, active?.name ?? 'scratch')
      }

      const runFile = () => {
        if (active?.path != null) return runCode(active.code, basename(active.path))
        return runCode(code, active?.name ?? 'scratch')
      }

      const restartSession = async () => {
        try {
          const value = await api('session/restart', { method: 'POST', body: {} })
          setStatus({ running: value.running === true, pid: value.pid ?? null, uptimeMs: value.uptimeMs ?? 0 })
          flash('会话已重启')
        } catch (error) {
          flash(String(error.message ?? error))
        }
      }

      const stopSession = async () => {
        try {
          const value = await api('session/stop', { method: 'POST', body: {} })
          setStatus({ running: value.running === true, pid: value.pid ?? null, uptimeMs: value.uptimeMs ?? 0 })
          flash('会话已停止')
        } catch (error) {
          flash(String(error.message ?? error))
        }
      }

      // ------------------------------------------------------------- settings

      const saveConfig = async () => {
        if (draft === null) return
        try {
          const value = await api('config', { method: 'POST', body: draft })
          setConfig(value.config)
          setDraft(value.config)
          setPlots([])
          flash('配置已保存')
        } catch (error) {
          flash(String(error.message ?? error))
        }
      }

      const resetConfig = async () => {
        try {
          const value = await api('config', { method: 'POST', body: {} })
          setConfig(value.config)
          setDraft(value.config)
          flash('已恢复默认配置')
        } catch (error) {
          flash(String(error.message ?? error))
        }
      }

      // ---------------------------------------------------------- folder picker
      // The desktop shell has no window.prompt(), so adding a folder needs its own
      // browser: the host lists directories (GET /r/api/browse) and the panel shows them.

      const pickerGo = (path) => {
        setPicker((current) => (current === null ? current : { ...current, loading: true, error: '' }))
        api('browse?path=' + encodeURIComponent(path))
          .then((value) => setPicker((current) => (current === null ? current : { ...current, ...value, loading: false })))
          .catch((error) => setPicker((current) => (current === null ? current : { ...current, loading: false, error: String(error.message ?? error) })))
      }

      const openPicker = (mode, start) => {
        const initial = start ?? config?.workdir ?? ''
        setPicker({ mode, path: initial, parent: null, entries: [], loading: true, error: '' })
        pickerGo(initial)
      }

      const closePicker = () => setPicker(null)

      const confirmPicker = () => {
        if (picker === null) return
        const path = picker.path
        if (picker.mode === 'workdir') {
          setDraft((current) => (current === null ? current : { ...current, workdir: path, autoDetect: false }))
          closePicker()
          flash(`工作目录改为 ${path}（记得保存配置）`)
          return
        }
        api('roots', { method: 'POST', body: { path } })
          .then((value) => {
            setConfig((current) => ({ ...current, extraRoots: value.extraRoots }))
            setDraft((current) => (current === null ? current : { ...current, extraRoots: value.extraRoots }))
            refreshTree()
            closePicker()
            flash(`已添加 ${path}`)
          })
          .catch((error) => flash(String(error.message ?? error)))
      }

      const addRoot = () => openPicker('root', config?.workdir ?? treePath ?? '')

      const loadWorkspaces = () => {
        api('workspaces')
          .then((value) => setWorkspaces(Array.isArray(value.items) ? value.items : []))
          .catch(() => setWorkspaces([]))
      }

      const removeRoot = (path) => {
        api('roots', { method: 'POST', body: { path, action: 'remove' } })
          .then((value) => {
            setConfig((current) => ({ ...current, extraRoots: value.extraRoots }))
            setDraft((current) => (current === null ? current : { ...current, extraRoots: value.extraRoots }))
            refreshTree()
          })
          .catch((error) => flash(String(error.message ?? error)))
      }

      // ------------------------------------------------------------- keyboard

      const onKeyDown = (event) => {
        if (completion !== null) {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const step = event.key === 'ArrowDown' ? 1 : -1
            setCompletion({ ...completion, index: (completion.index + step + completion.items.length) % completion.items.length })
            return
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault()
            applyCompletion(completion.items[completion.index], event.currentTarget)
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setCompletion(null)
            return
          }
        }
        if (event.key === 'F12' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j')) {
          event.preventDefault()
          gotoDefinition()
          return
        }
        if ((event.metaKey || event.ctrlKey) && (event.key === ' ' || event.code === 'Space')) {
          event.preventDefault()
          openCompletion()
          return
        }
        if (event.metaKey || event.ctrlKey) {
          if (event.key === 'Enter') {
            event.preventDefault()
            runSelectionOrBuffer()
            return
          }
          if (event.key.toLowerCase() === 's') {
            event.preventDefault()
            saveActive(false)
            return
          }
        }
        if (event.key === 'Tab') {
          event.preventDefault()
          const target = event.currentTarget
          const start = target.selectionStart
          const end = target.selectionEnd
          const next = `${active.code.slice(0, start)}  ${active.code.slice(end)}`
          setCode(next)
          window.requestAnimationFrame(() => {
            target.selectionStart = start + 2
            target.selectionEnd = start + 2
          })
        }
      }

      const onScroll = () => {
        const textarea = codeRef.current
        if (textarea === null) return
        if (highlightRef.current !== null) {
          highlightRef.current.scrollTop = textarea.scrollTop
          highlightRef.current.scrollLeft = textarea.scrollLeft
        }
        if (gutterRef.current !== null) gutterRef.current.scrollTop = textarea.scrollTop
      }

      const trackCaret = () => {
        const textarea = codeRef.current
        if (textarea === null) return
        const upto = textarea.value.slice(0, textarea.selectionStart)
        const lines = upto.split('\n')
        setCaret({ line: lines.length, col: lines[lines.length - 1].length + 1 })
      }

      // ---------------------------------------------------------------- drags

      const beginDrag = (event) => {
        event.preventDefault()
        const move = (moveEvent) => {
          const next = window.innerHeight - moveEvent.clientY
          setConsoleHeight(Math.min(Math.max(next, 90), window.innerHeight - 220))
        }
        const up = () => {
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', up)
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
      }

      const beginTreeDrag = (event) => {
        event.preventDefault()
        const move = (moveEvent) => {
          const next = moveEvent.clientX - (event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0)
          setTreeWidth(Math.min(Math.max(next, 130), 420))
        }
        const up = () => {
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', up)
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
      }

      // --------------------------------------------------------------- render

      const panels = []

      function renderTree() {
        if (!treeOpen) return null
        const entries = tree?.entries ?? []
        return h('div', { className: 'rr-tree', style: { width: `${treeWidth}px` }, 'data-rr-tree': true },
          h('div', { className: 'rr-tree-head' },
            h('button', {
              className: 'rr-btn',
              title: '↑ ',
              onClick: () => tree !== null && loadTree(tree.parent),
              'data-rr-up': true
            }, '↑'),
            h('span', { className: 'rr-tree-name', style: { fontSize: '11px', color: 'var(--rr-muted)', flex: '1 1 auto' }, title: treePath ?? '' },
              basename(treePath ?? '')),
            h('button', { className: 'rr-btn', title: 'Refresh', onClick: () => loadTree(treePath ?? undefined) }, '↻')),
          h('div', { className: 'rr-tree-scroll', 'data-rr-tree-list': true },
            entries.length === 0
              ? h('div', { className: 'rr-tree-empty' }, '（空文件夹）')
              : entries.map((entry) => h('button', {
                key: entry.path,
                className: 'rr-tree-row',
                'data-rr-entry': entry.dir === true ? 'dir' : 'file',
                'data-active': active?.path === entry.path || undefined,
                title: entry.path,
                onClick: () => {
                  if (entry.dir === true) loadTree(entry.path)
                  else if (/\.(r|rmd)$/i.test(entry.name)) openPath(entry.path)
                  else flash('只能打开 .R / .Rmd')
                }
              },
              h('span', { style: { flex: 'none', width: '12px', opacity: .75 } }, entry.dir === true ? '▸' : '·'),
              h('span', { className: 'rr-tree-name', style: { flex: '1 1 auto' } }, entry.name)))),
          h('div', { className: 'rr-actions', style: { padding: '4px 6px', borderTop: '1px solid var(--rr-border-soft)' } },
            h('button', { className: 'rr-btn', onClick: addRoot, 'data-rr-add-root': true }, `＋ ${L('folders')}`),
            h('button', { className: 'rr-btn', onClick: () => setTreeOpen(false) }, '×')))
      }

      function renderTabs() {
        const keys = Object.keys(buffers).sort((a, b) => (buffers[a].at ?? 0) - (buffers[b].at ?? 0))
        if (keys.length === 0) return null
        return h('div', { className: 'rr-tabs', 'data-rr-tabs': true },
          keys.map((key) => h('button', {
            key,
            className: 'rr-tab',
            'data-active': key === activeKey || undefined,
            title: buffers[key].path ?? buffers[key].name,
            onClick: () => setActiveKey(key),
            onAuxClick: (event) => { if (event.button === 1) closeBuffer(key) }
          },
          buffers[key].code !== buffers[key].baseline ? h('span', { className: 'rr-tab-dot' }) : null,
          h('span', { className: 'rr-tab-name' }, buffers[key].path !== null ? basename(buffers[key].path) : `${buffers[key].name} (未保存)`),
          h('span', {
            style: { padding: '0 2px', opacity: .7 },
            onClick: (event) => { event.stopPropagation(); closeBuffer(key) }
          }, '\u00d7'))),
          h('button', { className: 'rr-tab', onClick: newDraft, title: '新建', 'data-rr-new': true }, '\uff0b'))
      }

      function renderEditor() {
        return h('div', { className: 'rr-editor-col' },
          renderTabs(),
          h('div', { className: 'rr-crumb' },
            h('span', { className: 'rr-crumb-path', 'data-rr-crumb': true, title: active?.path ?? '' },
              active === null ? '（没有打开的脚本）' : (active.path ?? `${active.name} · 草稿`)),
            dirty ? h('span', { className: 'rr-badge' }, '未保存') : null,
            h('span', { className: 'rr-spacer', style: { flex: '1 1 auto' } }),
            active !== null ? h('button', { className: 'rr-btn', onClick: () => saveActive(false), 'data-rr-save': true }, `${L('save')} ⌘S`) : null),
          h('div', { className: 'rr-code-area' },
            h('div', { className: 'rr-gutter', ref: gutterRef, 'data-rr-gutter': true },
              Array.from({ length: lineCount }, (_, index) => {
                const problem = problems.find((item) => Number(item.line) === index + 1)
                return h('div', {
                  key: index,
                  className: 'rr-gline',
                  title: problem === undefined ? '' : `${problem.severity}: ${problem.message}`,
                  'data-rr-diag': problem === undefined ? undefined : problem.severity
                },
                problem === undefined
                  ? null
                  : h('span', { className: `rr-gdot rr-gdot-${problem.severity}` }),
                h('span', { className: 'rr-gnum' }, String(index + 1)))
              })),
            h('div', { className: 'rr-stack' },
              highlightLayer(code, highlightRef),
              completion === null ? null : h('div', {
                className: 'rr-complete',
                'data-rr-complete': true,
                style: { left: `${Math.min(completion.left, 320)}px`, top: `${completion.top}px` }
              },
              h('div', { className: 'rr-complete-head' },
                completion.mode === 'namespace' ? '包的导出' : completion.mode === 'dollar' ? '字段' : '建议',
                h('span', { className: 'rr-spacer' }),
                h('span', { className: 'rr-complete-hint' }, '↑↓ 选择 · Enter 插入 · Esc 关闭')),
              completion.items.map((item, index) => h('div', {
                key: `${item.label}-${index}`,
                className: 'rr-complete-row',
                'data-active': index === completion.index ? 'true' : 'false',
                onMouseDown: (event) => {
                  event.preventDefault()
                  applyCompletion(item, codeRef.current)
                }
              },
              h('span', { className: 'rr-complete-kind' }, item.kind === 'function' ? 'ƒ' : item.kind === 'keyword' ? 'kw' : item.kind === 'field' ? '$' : '·'),
              h('span', { className: 'rr-complete-label' }, item.label),
              item.package === '' ? null : h('span', { className: 'rr-complete-pkg' }, item.package)))),
              h('textarea', {
                ref: codeRef,
                className: 'rr-code',
                'data-rr-code': true,
                value: code,
                spellCheck: false,
                autoCapitalize: 'off',
                autoCorrect: 'off',
                wrap: 'off',
                onChange: (event) => {
                  const next = event.currentTarget.value
                  setCode(next)
                  if (/[.$:]$/.test(next.slice(0, event.currentTarget.selectionStart))) {
                    window.requestAnimationFrame(() => openCompletion())
                  } else if (completion !== null) {
                    window.requestAnimationFrame(() => openCompletion())
                  }
                },
                onKeyDown,
                onKeyUp: trackCaret,
                onClick: (event) => {
                  trackCaret()
                  if (event.metaKey || event.ctrlKey) gotoDefinition()
                },
                onScroll
              }))))
      }

      const runConsoleCommand = (source) => {
        const text = String(source ?? '')
        if (text.trim() === '') return
        setCmdHistory((current) => [text, ...current.filter(item => item !== text)].slice(0, 100))
        setCmdIndex(-1)
        setCmd('')
        if (bottomTab !== 'console') setBottomTab('console')
        runCode(text, 'console')
      }

      const loadHelp = (topic) => {
        const clean = String(topic ?? '').trim().replace(/^\?+/, '')
        if (clean === '') return
        setHelpBusy(true)
        setHelpTopic(clean)
        api('help?topic=' + encodeURIComponent(clean))
          .then((value) => setHelpText(String(value.text ?? '')))
          .catch((error) => setHelpText(String(error.message ?? error)))
          .finally(() => setHelpBusy(false))
      }

      const loadData = (name) => {
        const clean = String(name ?? '').trim()
        if (clean === '') return
        setDataBusy(true)
        setDataName(clean)
        setBottomTab('data')
        api('data?name=' + encodeURIComponent(clean) + '&limit=2000')
          .then((value) => setDataTable(value))
          .catch((error) => setDataTable({ ok: false, error: String(error.message ?? error), name: clean }))
          .finally(() => setDataBusy(false))
      }

      const openHelpFor = (topic) => {
        setBottomTab('help')
        loadHelp(topic)
      }

      const loadPackages = (refresh) => {
        setPkgBusy(true)
        api('packages' + (refresh ? '?refresh=1' : ''))
          .then((value) => setPkgList(value))
          .catch((error) => setPkgList({ ok: false, error: String(error.message ?? error), loaded: [], installed: [] }))
          .finally(() => setPkgBusy(false))
      }

      const installOne = (name) => {
        const clean = String(name ?? '').trim()
        if (clean === '') return
        setPkgBusy(true)
        setInstallLog(`正在安装 ${clean}…（首次安装要编译依赖，可能要几分钟）`)
        api('package/install', { method: 'POST', body: { name: clean } })
          .then((value) => {
            setInstallLog(`${value.ok ? '安装完成' : '安装失败'}：${clean}\n\n${value.output ?? ''}`)
            if (value.ok) loadPackages(true)
          })
          .catch((error) => setInstallLog(`安装失败：${String(error.message ?? error)}`))
          .finally(() => setPkgBusy(false))
      }

      const renderPackagesBody = () => {
        const data = pkgList
        const needle = pkgFilter.trim().toLowerCase()
        if (data === null) {
          return h('div', { className: 'rr-empty' }, pkgBusy ? L('loading') : L('noPackages'))
        }
        if (data.ok === false) {
          return h('div', { className: 'rr-out rr-out-err' }, `读取包列表失败：${String(data.error ?? '')}`)
        }
        const loaded = Array.isArray(data.loaded) ? data.loaded : []
        const installed = (Array.isArray(data.installed) ? data.installed : [])
          .filter((item) => needle === '' || String(item.name).toLowerCase().includes(needle))
        const missing = /there is no package called [‘']([^’']+)[’']/.exec(
          `${log.slice(-1)[0]?.error ?? ''} ${log.slice(-1)[0]?.stderr ?? ''}`)
        return h('div', { className: 'rr-pkgs', 'data-rr-packages': true },
          h('div', { className: 'rr-help-bar' },
            h('input', {
              type: 'text',
              value: pkgFilter,
              placeholder: L('pkgFilterPlaceholder'),
              'data-rr-pkg-filter': true,
              style: { flex: '1 1 auto', minWidth: 0, height: 22, padding: '1px 6px', border: '1px solid var(--rr-border)', borderRadius: 5, background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 11.5 },
              onChange: (event) => setPkgFilter(event.currentTarget.value)
            }),
            h('button', { className: 'rr-btn', onClick: () => loadPackages(true) }, pkgBusy ? '…' : L('refresh'))),
          missing !== null
            ? h('div', { className: 'rr-hint rr-hint-warn' },
              `会话里缺少 ${missing[1]}，`,
              h('button', { className: 'rr-linkbtn', onClick: () => installOne(missing[1]) }, '点击安装'))
            : null,
          h('div', { className: 'rr-pkg-cols' },
            h('div', { className: 'rr-pkg-col' },
              h('div', { className: 'rr-pkg-head' }, `${L('loadedPackages')} (${loaded.length})`),
              h('div', { className: 'rr-pkg-list' },
                loaded.map((item) => h('div', { key: item.name, className: 'rr-pkg-row', title: item.path },
                  h('span', { className: 'rr-pkg-name' }, item.name),
                  h('span', { className: 'rr-pkg-ver' }, item.version ?? ''))))),
            h('div', { className: 'rr-pkg-col' },
              h('div', { className: 'rr-pkg-head' },
                `${L('installedPackages')} (${installed.length}${needle === '' ? '' : ' / ' + (data.installed?.length ?? 0)})`,
                h('span', { className: 'rr-spacer', style: { flex: '1 1 auto' } }),
                h('span', { style: { color: 'var(--rr-muted)', fontSize: 10 } }, data.installedAt ?? '')),
              h('div', { className: 'rr-pkg-list' },
                installed.slice(0, 400).map((item) => h('div', { key: `${item.name}-${item.version}`, className: 'rr-pkg-row' },
                  h('span', { className: 'rr-pkg-name' }, item.name),
                  h('span', { className: 'rr-pkg-ver' }, item.version ?? ''),
                  h('button', {
                    className: 'rr-linkbtn',
                    title: `library(${item.name})`,
                    onClick: () => runCode(`library(${item.name})`, `library(${item.name})`)
                  }, '载入')))))),
          h('div', { className: 'rr-pkg-install' },
            h('input', {
              type: 'text',
              value: installName,
              placeholder: L('installPlaceholder'),
              'data-rr-pkg-install': true,
              style: { flex: '0 1 220px', height: 24, padding: '1px 6px', border: '1px solid var(--rr-border)', borderRadius: 5, background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 11.5 },
              onChange: (event) => setInstallName(event.currentTarget.value),
              onKeyDown: (event) => { if (event.key === 'Enter') installOne(event.currentTarget.value) }
            }),
            h('button', { className: 'rr-btn', 'data-primary': true, disabled: pkgBusy, onClick: () => installOne(installName) },
              pkgBusy ? L('installing') : 'install.packages()')),
          installLog === ''
            ? null
            : h('pre', { className: 'rr-pkg-log', 'data-rr-pkg-log': true }, installLog))
      }

      const renderRmd = (path) => {
        setRmdBusy(true)
        setRmdError('')
        api('rmd/render', { method: 'POST', body: { path } })
          .then((value) => {
            if (value.ok) {
              setRmdHtml(value.html)
              setView('rmd')
            } else {
              setRmdError(String(value.error ?? '渲染失败'))
              setView('rmd')
            }
          })
          .catch((error) => {
            setRmdError(String(error.message ?? error))
            setView('rmd')
          })
          .finally(() => setRmdBusy(false))
      }

      const renderBottomTabs = () => h('div', { className: 'rr-tabs' },
        ['console', 'history', 'help', 'data', 'packages'].map((key) => h('button', {
          key,
          className: 'rr-tabbtn',
          'data-active': bottomTab === key ? 'true' : 'false',
          'data-rr-tab': key,
          onClick: () => {
            setBottomTab(key)
            if (key === 'history') loadHistory()
            if (key === 'packages' && pkgList === null) loadPackages(false)
          }
        }, { console: L('console'), history: L('history'), help: L('help'), data: L('data'), packages: L('packages') }[key])))

      const renderConsoleBody = () => h(react.Fragment, null,
        h('div', { className: 'rr-log', 'data-rr-log': true },
          log.length === 0
            ? h('div', { className: 'rr-empty' }, L('emptyConsole'))
            : log.slice(-12).map((entry) => h('div', { key: entry.id, className: 'rr-entry', 'data-kind': entry.kind },
              h('div', { className: 'rr-entry-head' },
                h('b', null, entry.label ?? (entry.kind === 'run' ? 'run' : 'error')),
                h('span', null, clock(entry.at)),
                entry.ms !== undefined ? h('span', null, formatMs(entry.ms)) : null,
                entry.wd !== undefined ? h('span', { title: entry.wd }, basename(entry.wd)) : null),
              entry.stdout !== undefined && entry.stdout !== ''
                ? h('div', { className: 'rr-out', 'data-rr-out': true }, entry.stdout)
                : null,
              entry.stderr !== undefined && entry.stderr !== ''
                ? h('div', { className: 'rr-out rr-out-err' }, entry.stderr)
                : null,
              entry.error !== undefined && entry.error !== null && entry.error !== ''
                ? h('div', { className: 'rr-out rr-out-err' }, String(entry.error))
                : null,
              entry.plots !== undefined && entry.plots.length > 0
                ? h('div', { className: 'rr-out', style: { color: 'var(--rr-muted)' } }, `→ ${entry.plots.length} 张图`)
                : null))),
        h('div', { className: 'rr-prompt', 'data-rr-prompt': true },
          h('span', { className: 'rr-prompt-sign' }, '>'),
          h('textarea', {
            className: 'rr-prompt-input',
            rows: 1,
            value: cmd,
            placeholder: L('promptPlaceholder'),
            'data-rr-cmd': true,
            onChange: (event) => setCmd(event.currentTarget.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                runConsoleCommand(event.currentTarget.value)
                return
              }
              if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && cmdHistory.length > 0) {
                event.preventDefault()
                const delta = event.key === 'ArrowUp' ? 1 : -1
                const next = Math.min(Math.max(cmdIndex + delta, -1), cmdHistory.length - 1)
                setCmdIndex(next)
                setCmd(next === -1 ? '' : cmdHistory[next])
              }
            }
          })))

      const renderHistoryBody = () => h('div', { className: 'rr-history-list', 'data-rr-history': true },
        historyEntries.length === 0
          ? h('div', { className: 'rr-empty' }, L('emptyHistory'))
          : historyEntries.slice(0, 200).map((entry, index) => h('button', {
            key: `${entry.at ?? index}-${index}`,
            className: 'rr-history-row',
            'data-failed': entry.ok === false ? 'true' : 'false',
            title: entry.code,
            onClick: () => { setCmd(entry.code); setBottomTab('console') }
          }, String(entry.code).split('\n')[0].slice(0, 160),
          h('span', { className: 'rr-history-meta' },
            entry.file !== undefined ? basename(entry.file) : '',
            entry.ms !== undefined && entry.ms !== null ? ` ${formatMs(entry.ms)}` : ''))))

      const renderHelpBody = () => h('div', { style: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 } },
        h('div', { className: 'rr-help-bar' },
          h('span', { style: { color: 'var(--rr-muted)' } }, '?'),
          h('input', {
            type: 'text',
            value: helpTopic,
            placeholder: L('helpPlaceholder'),
            'data-rr-help-input': true,
            style: { flex: '1 1 auto', minWidth: 0, height: 22, padding: '1px 6px', border: '1px solid var(--rr-border)', borderRadius: 5, background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 11.5 },
            onChange: (event) => setHelpTopic(event.currentTarget.value),
            onKeyDown: (event) => { if (event.key === 'Enter') loadHelp(event.currentTarget.value) }
          }),
          h('button', { className: 'rr-btn', onClick: () => loadHelp(helpTopic) }, helpBusy ? '…' : L('look'))),
        h('div', { className: 'rr-help', 'data-rr-help': true },
          helpText === ''
            ? h('div', { className: 'rr-empty' }, L('emptyHelp'))
            : h('pre', null, helpText)))

      const numericCell = (cell) => {
        const text = String(cell)
        if (!/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(text)) return null
        return Number(text)
      }

      const renderDataBody = () => {
        const table = dataTable
        const toolbar = h('div', { className: 'rr-help-bar' },
          h('input', {
            type: 'text',
            value: dataName,
            placeholder: L('dataPlaceholder'),
            'data-rr-data-input': true,
            style: { flex: '1 1 190px', minWidth: 0, height: 22, padding: '1px 6px', border: '1px solid var(--rr-border)', borderRadius: 5, background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 11.5 },
            onChange: (event) => setDataName(event.currentTarget.value),
            onKeyDown: (event) => { if (event.key === 'Enter') loadData(event.currentTarget.value) }
          }),
          table !== null && table.ok !== false
            ? h('input', {
              type: 'text',
              value: dataFilter,
              placeholder: L('filterPlaceholder'),
              'data-rr-data-filter': true,
              style: { flex: '1 1 120px', minWidth: 0, height: 22, padding: '1px 6px', border: '1px solid var(--rr-border)', borderRadius: 5, background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 11.5 },
              onChange: (event) => setDataFilter(event.currentTarget.value)
            })
            : null,
          h('button', { className: 'rr-btn', onClick: () => loadData(dataName) }, dataBusy ? '…' : L('look')))

        let body
        if (table === null) {
          body = h('div', { className: 'rr-empty' }, L('emptyData'))
        } else if (table.ok === false) {
          body = h('div', { className: 'rr-out rr-out-err' }, String(table.error ?? '无法预览'))
        } else {
          const needle = dataFilter.trim().toLowerCase()
          let rows = table.rows
          if (needle !== '') {
            rows = rows.filter((row) => row.some((cell) => String(cell).toLowerCase().includes(needle)))
          }
          if (dataSort.column >= 0) {
            const column = dataSort.column
            const direction = dataSort.direction
            rows = rows.slice().sort((left, right) => {
              const a = left[column]
              const b = right[column]
              const na = numericCell(a)
              const nb = numericCell(b)
              if (na !== null && nb !== null) return (na - nb) * direction
              return String(a).localeCompare(String(b)) * direction
            })
          }
          const headCells = table.columns.map((column, columnIndex) => h('th', {
            key: String(column),
            title: `${String(column)} — 点击排序`,
            'data-sorted': dataSort.column === columnIndex ? (dataSort.direction > 0 ? 'asc' : 'desc') : undefined,
            onClick: () => setDataSort((current) => current.column === columnIndex
              ? { column: columnIndex, direction: -current.direction }
              : { column: columnIndex, direction: 1 })
          }, String(column)))
          const bodyRows = rows.slice(0, 500).map((row, rowIndex) => h('tr', { key: rowIndex },
            row.map((cell, cellIndex) => h('td', {
              key: cellIndex,
              'data-num': numericCell(cell) === null ? 'false' : 'true',
              title: String(cell)
            }, String(cell)))))
          body = h(react.Fragment, null,
            h('div', { className: 'rr-hint' },
              `${table.name} · ${table.kind} · ${needle === '' ? '' : `筛选后 ${rows.length} 行 · `}显示前 ${Math.min(rows.length, 500)} / 共 ${table.total} 行`,
              h('span', { className: 'rr-spacer', style: { flex: '1 1 auto' } }),
              dataSort.column >= 0
                ? h('button', { className: 'rr-linkbtn', onClick: () => setDataSort({ column: -1, direction: 1 }) }, '清除排序')
                : null),
            h('table', null,
              h('thead', null, h('tr', null, headCells)),
              h('tbody', null, bodyRows)))
        }

        return h('div', { style: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 } },
          toolbar,
          h('div', { className: 'rr-data-table', 'data-rr-data': true }, body))
      }

      function renderConsole() {
        return h('div', { className: 'rr-console' },
          h('div', { className: 'rr-pane-head' },
            renderBottomTabs(),
            h('span', { className: 'rr-spacer', style: { flex: '1 1 auto' } }),
            bottomTab === 'console'
              ? h('button', { className: 'rr-btn', onClick: () => setLog([]), 'data-rr-clear': true }, L('clear'))
              : bottomTab === 'history'
                ? h('button', { className: 'rr-btn', onClick: () => { api('history', { method: 'POST', body: {} }).then(() => setHistoryEntries([])).catch(() => {}) } }, L('clear'))
                : null),
          bottomTab === 'console'
            ? renderConsoleBody()
            : bottomTab === 'history'
              ? renderHistoryBody()
              : bottomTab === 'help'
                ? renderHelpBody()
                : bottomTab === 'packages'
                  ? renderPackagesBody()
                  : renderDataBody())
      }

      function renderVars() {
        if (!varsOpen) return null
        return h('div', { className: 'rr-vars' },
          h('div', { className: 'rr-pane-head' },
            L('environment'),
            h('span', { className: 'rr-spacer', style: { flex: '1 1 auto' } }),
            h('button', { className: 'rr-btn', onClick: refreshVars, 'data-rr-refresh-vars': true }, L('refresh')),
            h('button', {
              className: 'rr-btn',
              'data-rr-clear-env': true,
              title: 'rm(list = ls())',
              onClick: () => runCode('rm(list = ls(envir = globalenv()), envir = globalenv())', '清空环境')
            }, L('clear'))),
          h('div', { className: 'rr-vars-scroll' },
            h('div', { className: 'rr-vtl', 'data-head': true },
              h('span', null, L('name')), h('span', null, L('value')), h('span', null, L('type')), h('span', null, L('size')), h('span', null, '')),
            vars.length === 0
              ? h('div', { className: 'rr-tree-empty' }, '环境是空的：先运行一段代码。')
              : vars.map((item) => h('button', {
                key: item.name,
                className: 'rr-vtl',
                'data-body': true,
                'data-rr-var': item.name,
                title: `${item.name} — 双击编辑`,
                onClick: () => setEditing({ name: item.name, value: item.preview })
              },
              h('span', { style: { fontFamily: 'var(--rr-mono)' } }, item.name),
              h('span', { className: 'rr-vval' }, String(item.preview ?? '')),
              h('span', null, String(item.class ?? '')),
              h('span', null, String(item.size ?? '')),
              h('span', {
                className: 'rr-vtable',
                role: 'button',
                'data-rr-var-table': item.name,
                title: '查看数据',
                onClick: (event) => { event.stopPropagation(); loadData(item.name) }
              }, L('table'))))))
      }

      const openPlot = (index) => {
        setPlotIndex(Math.min(Math.max(index, 0), Math.max(plots.length - 1, 0)))
        setPlotFit(true)
        setView('plot')
      }

      const stepPlot = (delta) => {
        if (plots.length === 0) return
        setPlotIndex((current) => {
          const base = current === null ? 0 : current
          return (base + delta + plots.length) % plots.length
        })
      }

      react.useEffect(() => {
        if (view !== 'plot') return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') { event.preventDefault(); setView('code') }
          else if (event.key === 'ArrowLeft') { event.preventDefault(); stepPlot(-1) }
          else if (event.key === 'ArrowRight') { event.preventDefault(); stepPlot(1) }
          else if (event.key === '0') { event.preventDefault(); setPlotFit((current) => !current) }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [view, plotIndex, plots.length])

      const copyPath = (path) => {
        const text = path
        const done = () => flash('路径已复制')
        try {
          if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).then(done, () => flash(text)) }
          else flash(text)
        } catch { flash(text) }
      }

      const closePlot = () => setView('code')

      const deletePlot = (index) => {
        const path = plots[index]
        if (path === undefined) return
        api('plot/delete', { method: 'POST', body: { path } })
          .catch(() => {})
          .finally(() => {
            setPlots((current) => current.filter((item) => item !== path))
            setPlotIndex((current) => Math.max(0, Math.min(current ?? 0, plots.length - 2)))
            if (plots.length <= 1) setView('code')
          })
      }

      const openPlotExternally = (path) => {
        const url = artifactUrl(path)
        try {
          const opened = window.open(url, '_blank', 'noopener,noreferrer')
          if (opened !== null) return
        } catch {}
        navigator.clipboard?.writeText(path).catch(() => {})
        flash('浏览器拦住了新标签页，PNG 路径已复制：' + basename(path))
      }

      const beginPlotResize = (event) => {
        event.preventDefault()
        event.stopPropagation()
        const startX = event.clientX
        const startY = event.clientY
        const { width, height } = plotSize
        const move = (moveEvent) => {
          const nextWidth = Math.min(Math.max(width + moveEvent.clientX - startX, 420), window.innerWidth - 40)
          const nextHeight = Math.min(Math.max(height + moveEvent.clientY - startY, 320), window.innerHeight - 40)
          setPlotSize({ width: nextWidth, height: nextHeight })
        }
        const up = () => {
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', up)
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
      }

      function renderPlotWindow() {
        if (plots.length === 0) return null
        const index = Math.min(Math.max(plotIndex ?? 0, 0), plots.length - 1)
        const path = plots[index]
        const width = Math.min(plotSize.width, window.innerWidth - 40)
        const height = Math.min(plotSize.height, window.innerHeight - 40)
        const imageStyle = plotFit
          ? undefined
          : plotNatural === null
            ? { maxWidth: 'none', maxHeight: 'none' }
            : { width: `${Math.round(plotNatural.width * plotZoom)}px`, height: 'auto', maxWidth: 'none', maxHeight: 'none' }
        const card = h('div', {
          className: 'rr-lb-card',
          'data-rr-plot-window': true,
          style: { width: `${width}px`, height: `${height}px` },
          onClick: (event) => event.stopPropagation()
        },
        h('div', { className: 'rr-lb-bar' },
          h('button', { className: 'rr-lb-btn', 'data-icon': 'true', onClick: closePlot, title: `${L('close')} (Esc)` }, '✕'),
          h('span', { className: 'rr-lb-title', title: path }, `${index + 1} / ${plots.length} · ${basename(path)}`),
          h('span', { className: 'rr-spacer' }),
          plots.length > 1 ? h('button', { className: 'rr-lb-btn', 'data-icon': 'true', onClick: () => stepPlot(-1), title: `${L('prev')} (←)` }, '‹') : null,
          plots.length > 1 ? h('button', { className: 'rr-lb-btn', 'data-icon': 'true', onClick: () => stepPlot(1), title: `${L('next')} (→)` }, '›') : null,
          h('span', { className: 'rr-lb-zoom' },
            h('button', {
              className: 'rr-lb-btn', 'data-icon': 'true', title: '缩小',
              onClick: () => { setPlotFit(false); setPlotZoom((z) => Math.max(0.1, Number((z - 0.1).toFixed(2)))) }
            }, '−'),
            h('input', {
              type: 'range', min: 10, max: 400, step: 5,
              className: 'rr-lb-range',
              'data-rr-zoom': true,
              value: Math.round((plotFit ? 1 : plotZoom) * 100),
              title: '缩放（拖动滑块）',
              onChange: (event) => {
                setPlotFit(false)
                setPlotZoom(Math.max(0.1, Number(event.currentTarget.value) / 100))
              }
            }),
            h('button', {
              className: 'rr-lb-btn', 'data-icon': 'true', title: '放大',
              onClick: () => { setPlotFit(false); setPlotZoom((z) => Math.min(4, Number((z + 0.1).toFixed(2)))) }
            }, '＋'),
            h('span', { className: 'rr-lb-zoomval', 'data-rr-zoom-value': true }, plotFit ? '适应' : `${Math.round(plotZoom * 100)}%`)),
          h('button', {
            className: 'rr-lb-btn', 'data-on': plotFit ? 'true' : 'false',
            onClick: () => { setPlotFit((current) => !current); if (plotFit) setPlotZoom(1) },
            title: '适应窗口 / 原始大小（0）'
          }, plotFit ? L('fit') : L('actual')),
          h('button', { className: 'rr-lb-btn', onClick: () => openPlotExternally(path), title: 'Open the original PNG' }, L('openOriginal')),
          h('button', { className: 'rr-lb-btn', onClick: () => copyPath(path), title: 'Copy PNG path' }, L('copyPath')),
          h('button', { className: 'rr-lb-btn', onClick: () => deletePlot(index), title: 'Delete' }, L('delete'))),
        h('div', { className: 'rr-lb-canvas', 'data-zoom': plotFit ? 'fit' : 'full', style: { padding: plotFit ? '14px' : '10px' } },
          h('img', {
            src: artifactUrl(path),
            alt: basename(path),
            draggable: false,
            style: imageStyle,
            onLoad: (event) => {
              const image = event.currentTarget
              if (image.naturalWidth > 0) setPlotNatural({ width: image.naturalWidth, height: image.naturalHeight })
            },
            onClick: () => { if (!plotFit) setPlotFit(true) }
          })),
        h('div', { className: 'rr-lb-foot' }, L('plotHint')),
        h('div', { className: 'rr-lb-grip', 'data-rr-plot-grip': true, onMouseDown: beginPlotResize, title: '拖动改变窗口大小' }))

        const overlay = h('div', { className: 'rr-lb-portal', onClick: closePlot }, card)
        if (reactDom !== null && typeof reactDom.createPortal === 'function') {
          return reactDom.createPortal(overlay, document.body)
        }
        return h('div', { className: 'rr-plotview', 'data-rr-plotview': true }, overlay)
      }

      const clearPlots = () => {
        api('plot/clear', { method: 'POST', body: {} })
          .catch(() => {})
          .finally(() => {
            setPlots([])
            setPlotIndex(0)
            setView('code')
          })
      }

      function renderPlots() {
        if (plots.length === 0) {
          return h('div', { className: 'rr-plots', 'data-rr-plots': true },
            h('div', { className: 'rr-plots-empty' }, L('emptyPlots')))
        }
        return h('div', { className: 'rr-plots', 'data-rr-plots': true },
          h('div', { className: 'rr-plots-strip' },
            plots.map((path, index) => h('div', { key: `${path}-${index}`, className: 'rr-thumb-wrap' },
              h('button', {
                className: 'rr-thumb',
                title: `${path}\n点击放大`,
                'data-rr-thumb': true,
                onClick: () => openPlot(index)
              },
              h('img', { src: artifactUrl(path), alt: basename(path), loading: 'lazy' }),
              h('div', { className: 'rr-thumb-name' }, basename(path))),
              h('button', {
                className: 'rr-thumb-del',
                title: '删除这张图形',
                'data-rr-thumb-del': true,
                onClick: (event) => {
                  event.stopPropagation()
                  deletePlot(index)
                }
              }, '×')))),
          h('button', { className: 'rr-linkbtn rr-plots-clear', onClick: clearPlots, title: '清空图形列表并从磁盘删除' }, '清空'))
      }

      function renderPlotsGrid() {
        return h('div', { className: 'rr-gridview', 'data-rr-grid': true },
          h('div', { className: 'rr-grid-bar' },
            h('button', { className: 'rr-btn', onClick: () => setView('code') }, `← ${L('back')}`),
            h('span', { style: { color: 'var(--rr-muted)', fontSize: 11 } }, `全部图形（${plots.length}）`),
            h('span', { className: 'rr-spacer', style: { flex: '1 1 auto' } }),
            h('button', { className: 'rr-linkbtn', onClick: clearPlots }, L('clear'))),
          h('div', { className: 'rr-grid' },
            plots.map((path, index) => h('div', { key: `${path}-${index}`, className: 'rr-grid-cell' },
              h('button', {
                className: 'rr-grid-thumb',
                title: `${basename(path)}\n点击放大`,
                onClick: () => openPlot(index)
              }, h('img', { src: artifactUrl(path), alt: basename(path), loading: 'lazy' })),
              h('div', { className: 'rr-grid-meta' },
                h('span', { title: path }, basename(path)),
                h('button', { className: 'rr-linkbtn', onClick: () => deletePlot(index), title: '删除这张图' }, '删除'))))))
      }

      function renderRmdView() {
        return h('div', { className: 'rr-rmd', 'data-rr-rmd': true },
          h('div', { className: 'rr-grid-bar' },
            h('button', { className: 'rr-btn', onClick: () => setView('code') }, `← ${L('back')}`),
            h('button', {
              className: 'rr-btn',
              disabled: rmdBusy || active?.path == null,
              onClick: () => renderRmd(active?.path)
            }, rmdBusy ? L('knitting') : L('knit')),
            h('span', { className: 'rr-spacer', style: { flex: '1 1 auto' } }),
            rmdHtml === ''
              ? null
              : h('button', { className: 'rr-btn', onClick: () => openPlotExternally(rmdHtml) }, '打开 HTML')),
          rmdError !== ''
            ? h('div', { className: 'rr-rmd-error' },
              /rmarkdown/i.test(rmdError) && /no package|there is no package|缺/i.test(rmdError)
                ? h('div', { className: 'rr-hint rr-hint-warn' },
                  '渲染需要 rmarkdown 包：',
                  h('button', {
                    className: 'rr-linkbtn',
                    onClick: () => { installOne('rmarkdown'); setBottomTab('packages') }
                  }, '点这里安装'))
                : null,
              h('pre', { className: 'rr-pkg-log', 'data-rr-rmd-error': true }, rmdError))
            : rmdHtml === ''
              ? h('div', { className: 'rr-empty' }, L('emptyConsole'))
              : h('iframe', {
                className: 'rr-rmd-frame',
                src: artifactUrl(rmdHtml),
                title: 'Rmd 预览',
                sandbox: 'allow-same-origin allow-scripts allow-popups allow-forms'
              }))
      }

      const problemCount = problems.filter((item) => item.severity === 'error').length
      const warnCount = problems.filter((item) => item.severity === 'warning').length

      function renderStatus() {
        return h('div', { className: 'rr-status' },
          h('span', { className: 'rr-dot', 'data-on': status.running ? 'true' : 'false', 'data-busy': running ? 'true' : undefined }),
          h('span', { 'data-rr-session': true }, status.running ? `${L('sessionRunning')} ${status.pid}` : L('sessionStopped')),
          h('span', null, `Ln ${caret.line}, Col ${caret.col}`),
          problems.length === 0
            ? null
            : h('span', {
              className: 'rr-problems',
              title: problems.map((item) => `L${item.line}: ${item.message}`).join('\n'),
              'data-rr-problems': problems.length
            }, problemCount > 0 ? `✕ ${problemCount}` : `! ${warnCount}`),
          h('span', { className: 'rr-spacer' }),
          probe !== null
            ? h('span', { title: String(probe.version ?? '') }, probe.ok ? String(probe.version ?? 'R').split(' -- ')[0] : 'R 不可用')
            : null,
          h('button', { className: 'rr-btn', onClick: () => setTreeOpen((value) => !value), 'data-rr-toggle-tree': true }, treeOpen ? `${L('files')} ×` : L('files')),
          h('button', { className: 'rr-btn', onClick: () => setVarsOpen((value) => !value), 'data-rr-toggle-vars': true }, varsOpen ? `${L('environment')} ×` : L('environment')))
      }

      function renderToolbar() {
        return h('div', { className: 'rr-toolbar' },
          h('div', { className: 'rr-group' },
            h('button', {
              className: 'rr-btn',
              'data-primary': true,
              'data-rr-run': true,
              disabled: running || active === null,
              title: 'Run the selection, or the whole buffer (⌘/Ctrl+Enter)',
              onClick: runSelectionOrBuffer
            }, running ? L('running') : L('run')),
            h('button', {
              className: 'rr-btn',
              'data-rr-source': true,
              disabled: running || active === null,
              title: 'Run the whole file',
              onClick: runFile
            }, L('runAll')),
            h('button', {
              className: 'rr-btn',
              'data-rr-save-btn': true,
              disabled: active === null,
              onClick: () => saveActive(false)
            }, L('save'))),
          h('div', { className: 'rr-group' },
            h('button', { className: 'rr-btn', 'data-rr-restart': true, onClick: restartSession }, L('restart')),
            h('button', { className: 'rr-btn', 'data-rr-stop': true, onClick: stopSession, disabled: !status.running }, L('stop'))),
          h('div', { className: 'rr-group' },
            h('button', { className: 'rr-btn', 'data-rr-new-btn': true, onClick: newDraft }, L('newScript')),
            /\.(Rmd|rmd|qmd)$/.test(String(active?.path ?? ''))
              ? h('button', {
                className: 'rr-btn',
                'data-rr-knit': true,
                disabled: rmdBusy || active === null,
                title: 'rmarkdown::render() → 预览 HTML',
                onClick: () => renderRmd(active.path)
              }, rmdBusy ? L('knitting') : L('knit'))
              : null,
            plots.length > 0
              ? h('button', {
                className: 'rr-btn',
                'data-on': view === 'plots' ? 'true' : 'false',
                'data-rr-all-plots': true,
                onClick: () => setView(view === 'plots' ? 'code' : 'plots')
              }, `${L('plots')} ${plots.length}`)
              : null),
          h('span', { className: 'rr-spacer' }),
          message !== '' ? h('span', { className: 'rr-badge', 'data-rr-message': true }, message) : null,
          h('button', {
            className: 'rr-btn',
            'data-on': view === 'settings' ? 'true' : 'false',
            'data-rr-settings': true,
            onClick: () => {
              if (view === 'settings') return setView('code')
              setDraft(config)
              setView('settings')
            }
          }, view === 'settings' ? L('back') : L('settings')))
      }

      function renderSettings() {
        const value = draft ?? config ?? {}
        const field = (label, key, kind) => {
          if (kind === 'checkbox') {
            return h('label', { className: 'rr-check', key },
              h('input', {
                type: 'checkbox',
                'data-rr-config': key,
                checked: value[key] === true,
                onChange: (event) => setDraft({ ...value, [key]: event.currentTarget.checked })
              }),
              h('span', null, label))
          }
          if (kind === 'number') {
            return h('div', { className: 'rr-row', key },
              h('span', { className: 'rr-row-label' }, label),
              h('div', null, h('input', {
                type: 'number',
                'data-rr-config': key,
                value: value[key] ?? '',
                onChange: (event) => setDraft({ ...value, [key]: Number(event.currentTarget.value) || 0 })
              })))
          }
          if (kind === 'textarea') {
            return h('div', { className: 'rr-row', key },
              h('span', { className: 'rr-row-label' }, label),
              h('div', null, h('textarea', {
                'data-rr-config': key,
                value: value[key] ?? '',
                spellCheck: false,
                onChange: (event) => setDraft({ ...value, [key]: event.currentTarget.value })
              })))
          }
          return h('div', { className: 'rr-row', key },
            h('span', { className: 'rr-row-label' }, label),
            h('div', null, h('input', {
              type: 'text',
              'data-rr-config': key,
              value: value[key] === undefined || value[key] === null ? '' : String(value[key]),
              spellCheck: false,
              autoCapitalize: 'off',
              autoCorrect: 'off',
              onChange: (event) => setDraft({ ...value, [key]: event.currentTarget.value })
            })))
        }

        const roots = Array.isArray(value.extraRoots) ? value.extraRoots : []

        return h('div', { className: 'rr-settings', 'data-rr-settings-pane': true },
          h('div', { className: 'rr-section' },
            h('h4', null, 'R'),
            field('R 可执行文件', 'rBinary'),
            field('Rscript', 'rscriptBinary'),
            field('会话启动参数', 'sessionArgs'),
            h('div', { className: 'rr-hint', 'data-rr-probe': true },
              probe === null
                ? 'R 检测中…'
                : probe.ok
                  ? `R 可用 · ${probe.version ?? ''} · ${formatMs(probe.ms)}`
                  : `R 不可用：${probe.error ?? '未知错误'}`)),
          h('div', { className: 'rr-section' },
            h('h4', null, L('workspace')),
            field('工作目录', 'workdir'),
            h('div', { className: 'rr-row' },
              h('span', { className: 'rr-row-label' }, L('chooseDir')),
              h('div', { className: 'rr-roots', style: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' } },
                h('button', {
                  className: 'rr-btn',
                  'data-rr-browse-workdir': true,
                  onClick: () => openPicker('workdir', value.workdir)
                }, L('browse')),
                workspaces.length === 0 ? null : h('select', {
                  'data-rr-workspace-pick': true,
                  value: '',
                  onChange: (event) => {
                    const path = event.currentTarget.value
                    if (path !== '') setDraft({ ...value, workdir: path, autoDetect: false })
                  }
                },
                h('option', { value: '' }, '会话工作区…'),
                workspaces.map((workspace) => h('option', { key: workspace.id, value: workspace.path }, workspace.title))),
                h('button', {
                  className: 'rr-btn',
                  'data-rr-follow-session': true,
                  title: '让工作目录跟随当前 DSH 会话的工作区',
                  onClick: () => setDraft({ ...value, autoDetect: true })
                }, L('followSession')))),
            field('脚本保存目录', 'scriptDir'),
            field('运行文件时以文件所在目录为工作目录', 'runInFileDir', 'checkbox'),
            h('div', { className: 'rr-row' },
              h('span', { className: 'rr-row-label' }, '额外的文件夹'),
              h('div', { className: 'rr-roots' },
                roots.length === 0 ? h('span', { className: 'rr-hint' }, '（无）') : null,
                roots.map((root) => h('div', { className: 'rr-root-row', key: root },
                  h('span', { title: root }, root),
                  h('button', { className: 'rr-btn', onClick: () => removeRoot(root) }, '移除'))),
                h('button', { className: 'rr-btn', onClick: addRoot, style: { justifySelf: 'start' } }, L('addFolder')))),
            config?.detected !== undefined
              ? h('div', { className: 'rr-hint' },
                `检测到的工作区：${config.detected.cwd} （${
                  config.detected.source === 'session' ? '来自当前会话'
                    : config.detected.source === 'registry' ? '来自注册工作区'
                      : '来自宿主进程目录'}）`)
              : null),
          h('div', { className: 'rr-section' },
            h('h4', null, L('execution')),
            field('运行成功后自动保存', 'autoSave', 'checkbox'),
            field('超时（毫秒）', 'timeoutMs', 'number'),
            field('输出上限（字符）', 'maxOutputChars', 'number')),
          h('div', { className: 'rr-section' },
            h('h4', null, L('plotsSection')),
            field('宽（像素）', 'plotWidth', 'number'),
            field('高（像素）', 'plotHeight', 'number'),
            field('分辨率（dpi）', 'plotRes', 'number')),
          h('div', { className: 'rr-section' },
            h('h4', null, L('envSection')),
            field('JSON 对象', 'envJson', 'textarea')),
          h('div', { className: 'rr-section' },
            h('h4', null, L('info')),
            h('div', { className: 'rr-hint', 'data-rr-config-path': true }, `配置文件：${config?.configPath ?? '~/.dsh/r-runner.json'}`),
            h('div', { className: 'rr-hint' }, `会话：${status.running ? `进行中（pid ${status.pid}）` : '未启动'}`),
            h('div', { className: 'rr-hint' }, `驱动：${config?.driverPath ?? ''}`),
            h('div', { className: 'rr-hint', 'data-rr-project': true },
              state.project === null || state.project === undefined
                ? '项目：未发现 .Rproj（工作目录下没有 RStudio 项目文件）'
                : `项目：${state.project.name}`),
            h('div', { className: 'rr-row' },
              h('span', { className: 'rr-row-label' }, L('language')),
              h('div', { className: 'rr-roots' },
                h('select', {
                  value: lang,
                  'data-rr-lang': true,
                  onChange: (event) => setLang(event.currentTarget.value)
                },
                h('option', { value: 'zh' }, '中文'),
                h('option', { value: 'en' }, 'English'))))),
          h('div', { className: 'rr-actions' },
            h('button', { className: 'rr-btn', 'data-primary': true, 'data-rr-save-config': true, onClick: saveConfig }, L('saveConfig')),
            h('button', { className: 'rr-btn', 'data-rr-reset-config': true, onClick: resetConfig }, L('restoreDefaults')),
            h('button', { className: 'rr-btn', 'data-rr-restart-2': true, onClick: restartSession }, L('restart'))))
      }

      function renderPicker() {
        if (picker === null) return null
        const dirs = Array.isArray(picker.entries) ? picker.entries : []
        const body = picker.loading
          ? h('div', { className: 'rr-pick-empty' }, L('loading'))
          : picker.error !== ''
            ? h('div', { className: 'rr-pick-empty' }, picker.error)
            : dirs.length === 0
              ? h('div', { className: 'rr-pick-empty' }, L('noSubfolders'))
              : dirs.map((dir) => h('div', {
                className: 'rr-pick-row',
                key: dir.path,
                'data-rr-pick-dir': dir.path,
                title: dir.path,
                onDoubleClick: () => confirmPicker(),
                onClick: () => pickerGo(dir.path)
              },
              h('span', { 'aria-hidden': true, style: { opacity: 0.7 } }, '📁'),
              h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, dir.name)))

        const card = h('div', { className: 'rr-pick-card', 'data-rr-picker': true, onClick: (event) => event.stopPropagation() },
          h('div', { className: 'rr-pick-head' },
            h('span', { className: 'rr-pick-title' }, picker.mode === 'workdir' ? L('pickWorkdir') : L('pickFolder')),
            h('button', {
              className: 'rr-btn',
              title: L('parentDir'),
              onClick: () => picker.parent !== null && pickerGo(picker.parent)
            }, '⤴'),
            h('button', { className: 'rr-btn', onClick: () => pickerGo(picker.home ?? '/') }, L('homeDir')),
            h('button', {
              className: 'rr-btn',
              title: '回到当前工作区',
              onClick: () => pickerGo(picker.workdir ?? picker.path)
            }, L('currentWorkdir'))),
          h('div', { className: 'rr-pick-path', title: picker.path }, picker.path),
          h('div', { className: 'rr-pick-list', 'data-rr-pick-list': true }, body),
          h('div', { className: 'rr-pick-foot' },
            h('button', { className: 'rr-btn', onClick: closePicker }, L('cancel')),
            h('button', {
              className: 'rr-btn',
              'data-primary': true,
              'data-rr-pick-confirm': true,
              disabled: picker.loading || picker.error !== '',
              onClick: confirmPicker
            }, picker.mode === 'workdir' ? L('useThisDir') : L('addThisFolder'))))

        const overlay = h('div', { className: 'rr-lb-portal rr-pick-portal', onClick: closePicker }, card)
        if (reactDom !== null && typeof reactDom.createPortal === 'function') {
          return reactDom.createPortal(overlay, document.body)
        }
        return overlay
      }

      function renderModal() {
        if (editing === null) return null
        return h('div', { className: 'rr-modal-backdrop', onMouseDown: (event) => { if (event.target === event.currentTarget) setEditing(null) } },
          h('div', { className: 'rr-modal', 'data-rr-var-modal': true },
            h('h3', null, `编辑 ${editing.name}`),
            h('p', null, '输入 R 表达式，例如 1:10 或 c("a","b")'),
            h('input', {
              autoFocus: true,
              value: editing.value,
              'data-rr-var-input': true,
              onChange: (event) => setEditing({ ...editing, value: event.currentTarget.value }),
              onKeyDown: (event) => {
                if (event.key === 'Enter') applyEdit()
                if (event.key === 'Escape') setEditing(null)
              }
            }),
            h('div', { className: 'rr-actions' },
              h('button', { className: 'rr-btn', 'data-primary': true, 'data-rr-var-apply': true, onClick: applyEdit }, '应用'),
              h('button', { className: 'rr-btn', onClick: () => setEditing(null) }, '取消'))))
      }

      const applyEdit = () => {
        if (editing === null) return
        api('var', { method: 'POST', body: { name: editing.name, value: editing.value } })
          .then(() => {
            setEditing(null)
            refreshVars()
          })
          .catch((error) => flash(String(error.message ?? error)))
      }

      return h('div', { className: 'rr-root', 'data-rr-root': true, 'data-rr-view': view },
        renderToolbar(),
        view === 'settings'
          ? renderSettings()
          : view === 'plots'
            ? renderPlotsGrid()
            : view === 'rmd'
              ? renderRmdView()
              : [h('div', { className: 'rr-main', key: 'main' },
            renderTree(),
            treeOpen ? h('div', { className: 'rr-vsplit', key: 'split', onMouseDown: beginTreeDrag }) : null,
            renderEditor()),
          h('div', { className: 'rr-split', key: 'hsplit', title: '⋮', onMouseDown: beginDrag }),
          h('div', { className: 'rr-bottom', key: 'bottom', style: { height: `${consoleHeight}px` } },
            renderConsole(),
            renderVars()),
          renderPlots(),
          renderStatus()],
        renderModal(),
        renderPicker(),
        view === 'plot' ? renderPlotWindow() : null)
    }

    // -------------------------------------------------------------- registration

    function Title() {
      return h(react.Fragment, null,
        h('span', { 'aria-hidden': true, style: { opacity: 0.8, marginRight: '4px' } }, '▤'),
        'R')
    }

    const dictionaries = { zh, en }

    const definition = (t) => ({
      id: ID,
      kind: KIND,
      priority: 'extension',
      title: () => t('type.label'),
      guide: [{
        id: 'r',
        order: 60,
        title: () => t('guide.title'),
        description: () => t('guide.description'),
        icon: () => h('span', { 'aria-hidden': true, style: { fontSize: '13px', lineHeight: 1 } }, '▤')
      }]
    })

    const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight']

    /** Active workspace, exported for the smoke tests. */
    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-r-runner: dictionaries')
      ctx.effect(() => ctx.sidebarRightTabs.register(definition(t)), 'dsh-r-runner: tab type')
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: ID,
        locale: NS
      }, Body)), 'dsh-r-runner: tab body')
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab.title',
        key: ID
      }, Title)), 'dsh-r-runner: tab title')
      ctx.inject(['shortcuts'], (shortcutCtx) => {
        shortcutCtx.effect(() => shortcutCtx.shortcuts.register({
          id: 'r.runner.open',
          label: () => t('shortcut'),
          aliases: ['r runner', 'run r', 'rstudio'],
          defaults: {
            'desktop:macos': { code: 'KeyR', modifiers: ['primary', 'shift'] },
            'desktop:windows': { code: 'KeyR', modifiers: ['primary', 'shift'] },
            'desktop:linux': { code: 'KeyR', modifiers: ['primary', 'shift'] },
            'web:macos': { code: 'KeyR', modifiers: ['primary', 'shift', 'alt'] },
            'web:windows': { code: 'KeyR', modifiers: ['primary', 'shift', 'alt'] }
          },
          regions: ['page', 'editable', 'terminal'],
          modals: [],
          resolve: () => {
            try {
              ctx.sidebarRight.openTab(KIND)
            } catch {
              return { status: 'blocked', reason: t('guide.description') }
            }
            return { status: 'handled', run: () => {} }
          }
        }), 'dsh-r-runner: shortcut')
      })
    }

    exports.apply = apply
    exports.inject = inject
    exports.__test = { tokenizeLine, chunkAt, countChunks, setActiveCwd, withWorkspace, basename, dirname }
    return module.exports
  }
})
