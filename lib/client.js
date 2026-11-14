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
.rr-root { display:flex; flex-direction:column; height:100%; min-height:0; width:100%; min-width:0; --rr-fg: inherit; --rr-muted: rgba(127,127,127,.92); --rr-border: rgba(127,127,127,.30); --rr-border-soft: rgba(127,127,127,.16); --rr-bg-soft: rgba(127,127,127,.07); --rr-bg-hover: rgba(127,127,127,.14); --rr-accent: #0a7aff; --rr-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; font-size:12px; color:var(--rr-fg); }
.rr-root * { box-sizing:border-box; }
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
.rr-pane-head { display:flex; align-items:center; gap:6px; padding:3px 8px; flex:none; border-bottom:1px solid var(--rr-border-soft); background:var(--rr-bg-soft); font-size:10.5px; letter-spacing:.04em; text-transform:uppercase; color:var(--rr-muted); }
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
.rr-vtl { display:grid; grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr) 58px 48px; gap:0 8px; padding:3px 8px; font-size:11px; align-items:center; border-bottom:1px solid var(--rr-border-soft); text-align:left; background:transparent; color:inherit; border-left:0; border-right:0; border-top:0; font-family:inherit; width:100%; cursor:default; }
.rr-vtl[data-head="true"] { color:var(--rr-muted); font-size:10px; text-transform:uppercase; letter-spacing:.03em; position:sticky; top:0; background:var(--rr-bg-soft); z-index:1; }
.rr-vtl[data-body="true"] { cursor:pointer; }
.rr-vtl[data-body="true"]:hover { background:var(--rr-bg-hover); }
.rr-vtl span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rr-vtl .rr-vval { font-family:var(--rr-mono); font-size:10.5px; color:var(--rr-muted); }
.rr-plots { display:flex; align-items:flex-start; gap:8px; overflow-x:auto; padding:6px 8px; flex:none; border-top:1px solid var(--rr-border-soft); background:var(--rr-bg-soft); min-height:0; }
.rr-plots-empty { color:var(--rr-muted); font-size:11px; }
.rr-thumb { display:flex; flex-direction:column; gap:2px; flex:none; width:104px; border:1px solid var(--rr-border-soft); border-radius:5px; overflow:hidden; background:rgba(127,127,127,.05); }
.rr-thumb img { width:100%; height:64px; object-fit:contain; background:#fff; display:block; }
.rr-thumb-name { font-size:9.5px; padding:0 4px 3px; color:var(--rr-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rr-thumb { cursor:zoom-in; padding:0; border-radius:5px; text-align:left; color:inherit; font:inherit; }
.rr-thumb:hover { border-color:var(--rr-accent); }
.rr-thumb:focus-visible { outline:2px solid var(--rr-accent); outline-offset:1px; }
.rr-lightbox { position:fixed; inset:0; z-index:70; background:rgba(12,14,18,.72); display:flex; flex-direction:column; }
.rr-lb-bar { display:flex; align-items:center; gap:8px; padding:8px 12px; color:#fff; background:rgba(12,14,18,.55); border-bottom:1px solid rgba(255,255,255,.14); }
.rr-lb-title { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--rr-mono); font-size:11px; opacity:.9; }
.rr-lb-btn { display:inline-flex; align-items:center; justify-content:center; height:24px; min-width:24px; padding:0 8px; border-radius:5px; border:1px solid rgba(255,255,255,.22); background:rgba(255,255,255,.08); color:#fff; font:inherit; font-size:11.5px; cursor:pointer; white-space:nowrap; }
.rr-lb-btn:hover { background:rgba(255,255,255,.18); }
.rr-lb-btn[data-on="true"] { background:var(--rr-accent); border-color:var(--rr-accent); }
.rr-lb-stage { flex:1 1 auto; min-height:0; overflow:auto; display:flex; align-items:center; justify-content:center; padding:12px; }
.rr-lb-stage img { display:block; background:#fff; border-radius:3px; box-shadow:0 10px 40px rgba(0,0,0,.45); }
.rr-lb-stage[data-zoom="fit"] img { max-width:100%; max-height:100%; object-fit:contain; }
.rr-lb-stage[data-zoom="full"] img { max-width:none; max-height:none; }
.rr-lb-hint { color:rgba(255,255,255,.72); font-size:10.5px; padding:6px 12px 8px; text-align:center; }
.rr-status { display:flex; align-items:center; gap:8px; padding:2px 8px; flex:none; border-top:1px solid var(--rr-border-soft); font-size:10.5px; color:var(--rr-muted); }
.rr-status .rr-spacer { flex:1 1 auto; }
.rr-settings { flex:1 1 auto; overflow:auto; padding:12px 14px 24px; }
.rr-section { margin-bottom:18px; }
.rr-section h4 { margin:0 0 8px; font-size:10.5px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--rr-muted); }
.rr-row { display:grid; grid-template-columns:170px minmax(0,1fr); gap:10px; align-items:center; padding:3px 0; }
.rr-row-label { font-size:11.5px; color:var(--rr-muted); }
.rr-row input[type="text"], .rr-row input[type="number"], .rr-row select, .rr-row textarea { width:100%; height:26px; padding:2px 7px; border-radius:5px; border:1px solid var(--rr-border); background:transparent; color:inherit; font:inherit; font-size:11.5px; }
.rr-row textarea { height:64px; padding:5px 7px; font-family:var(--rr-mono); font-size:11px; resize:vertical; }
.rr-row input:focus-visible, .rr-row select:focus-visible, .rr-row textarea:focus-visible { outline:1px solid var(--rr-accent); outline-offset:0; }
.rr-check { display:flex; align-items:center; gap:6px; padding:3px 0; font-size:11.5px; color:var(--rr-muted); }
.rr-actions { display:flex; gap:6px; padding-top:4px; }
.rr-hint { font-size:11px; color:var(--rr-muted); padding:2px 0; }
.rr-roots { display:flex; flex-direction:column; gap:5px; }
.rr-root-row { display:flex; align-items:center; gap:6px; padding:3px 6px; border:1px solid var(--rr-border-soft); border-radius:5px; font-family:var(--rr-mono); font-size:10.5px; }
.rr-root-row span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1 1 auto; }
.rr-roots > .rr-btn { align-self:flex-start; }
.rr-modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.42); display:flex; align-items:center; justify-content:center; z-index:60; }
.rr-modal { width:min(440px, 88vw); border-radius:8px; border:1px solid var(--rr-border); background:canvas; color:inherit; padding:14px 16px; box-shadow:0 12px 40px rgba(0,0,0,.35); }
.rr-modal h3 { margin:0 0 6px; font-size:13px; }
.rr-modal p { margin:0 0 8px; font-size:11.5px; color:var(--rr-muted); }
.rr-modal input { width:100%; height:28px; padding:3px 8px; border-radius:5px; border:1px solid var(--rr-border); background:transparent; color:inherit; font:inherit; font-size:12px; font-family:var(--rr-mono); }
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

    function Body(props) {
      ensureStyles()
      const initialView = typeof props?.initialView === 'string' ? props.initialView : 'code'
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
      const [lightbox, setLightbox] = react.useState(
        typeof props?.initialLightbox === 'number' ? { index: props.initialLightbox, fit: true } : null)
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
        localStorage.setItem(TREE_WIDTH_KEY, String(Math.round(treeWidth)))
      }, [treeWidth])

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

      const addRoot = () => {
        const path = window.prompt('文件夹绝对路径 / Folder path')
        if (path === null || path.trim() === '') return
        api('roots', { method: 'POST', body: { path: path.trim() } })
          .then((value) => {
            setConfig((current) => ({ ...current, extraRoots: value.extraRoots }))
            setDraft((current) => (current === null ? current : { ...current, extraRoots: value.extraRoots }))
            refreshTree()
          })
          .catch((error) => flash(String(error.message ?? error)))
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
            h('button', { className: 'rr-btn', onClick: addRoot, 'data-rr-add-root': true }, '＋ 文件夹'),
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
            active !== null ? h('button', { className: 'rr-btn', onClick: () => saveActive(false), 'data-rr-save': true }, '保存 ⌘S') : null),
          h('div', { className: 'rr-code-area' },
            h('div', { className: 'rr-gutter', ref: gutterRef },
              Array.from({ length: lineCount }, (_, index) => String(index + 1)).join('\n')),
            h('div', { className: 'rr-stack' },
              highlightLayer(code, highlightRef),
              h('textarea', {
                ref: codeRef,
                className: 'rr-code',
                'data-rr-code': true,
                wrap: 'off',
                spellCheck: false,
                value: code,
                spellCheck: false,
                autoCapitalize: 'off',
                autoCorrect: 'off',
                wrap: 'off',
                onChange: (event) => setCode(event.currentTarget.value),
                onKeyDown,
                onKeyUp: trackCaret,
                onClick: trackCaret,
                onScroll
              }))))
      }

      function renderConsole() {
        const entries = log.slice(-12)
        return h('div', { className: 'rr-console' },
          h('div', { className: 'rr-pane-head' },
            '控制台',
            h('span', { className: 'rr-spacer', style: { flex: '1 1 auto' } }),
            h('button', { className: 'rr-btn', onClick: () => setLog([]), 'data-rr-clear': true }, '清空')),
          h('div', { className: 'rr-log', 'data-rr-log': true },
            entries.length === 0
              ? h('div', { className: 'rr-empty' }, '还没有输出。写点 R 代码，按 ⌘/Ctrl+Enter 运行。')
              : entries.map((entry) => h('div', { key: entry.id, className: 'rr-entry', 'data-kind': entry.kind },
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
                  : null))))
      }

      function renderVars() {
        if (!varsOpen) return null
        return h('div', { className: 'rr-vars' },
          h('div', { className: 'rr-pane-head' },
            '环境',
            h('span', { className: 'rr-spacer', style: { flex: '1 1 auto' } }),
            h('button', { className: 'rr-btn', onClick: refreshVars, 'data-rr-refresh-vars': true }, '刷新')),
          h('div', { className: 'rr-vars-scroll' },
            h('div', { className: 'rr-vtl', 'data-head': true },
              h('span', null, '名称'), h('span', null, '值'), h('span', null, '类型'), h('span', null, '大小')),
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
              h('span', null, String(item.size ?? ''))))))
      }

      const openLightbox = (index) => setLightbox({ index, fit: true })

      const stepPlot = (delta) => setLightbox((current) => {
        if (current === null || plots.length === 0) return current
        const next = (current.index + delta + plots.length) % plots.length
        return { ...current, index: next }
      })

      react.useEffect(() => {
        if (lightbox === null) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') { event.preventDefault(); setLightbox(null) }
          else if (event.key === 'ArrowLeft') { event.preventDefault(); stepPlot(-1) }
          else if (event.key === 'ArrowRight') { event.preventDefault(); stepPlot(1) }
          else if (event.key === '0') { event.preventDefault(); setLightbox((current) => current === null ? current : { ...current, fit: true }) }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [lightbox, plots.length])

      const copyPath = (path) => {
        const text = path
        const done = () => flash('路径已复制')
        try {
          if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).then(done, () => flash(text)) }
          else flash(text)
        } catch { flash(text) }
      }

      function renderLightbox() {
        if (lightbox === null || plots.length === 0) return null
        const index = Math.min(Math.max(lightbox.index, 0), plots.length - 1)
        const path = plots[index]
        return h('div', { className: 'rr-lightbox', 'data-rr-lightbox': true, role: 'dialog', 'aria-modal': 'true', onMouseDown: (event) => { if (event.target === event.currentTarget) setLightbox(null) } },
          h('div', { className: 'rr-lb-bar' },
            h('button', { className: 'rr-lb-btn', onClick: () => setLightbox(null), title: '关闭（Esc）' }, '✕'),
            h('span', { className: 'rr-lb-title', title: path }, `${index + 1} / ${plots.length} · ${basename(path)}`),
            plots.length > 1 ? h('button', { className: 'rr-lb-btn', onClick: () => stepPlot(-1), title: '上一张（←）' }, '‹') : null,
            plots.length > 1 ? h('button', { className: 'rr-lb-btn', onClick: () => stepPlot(1), title: '下一张（→）' }, '›') : null,
            h('button', { className: 'rr-lb-btn', 'data-on': lightbox.fit ? 'true' : 'false', onClick: () => setLightbox({ ...lightbox, index, fit: !lightbox.fit }), title: '切换 适应窗口 / 原始大小（0）' }, lightbox.fit ? '适应' : '100%'),
            h('a', { className: 'rr-lb-btn', href: artifactUrl(path), target: '_blank', rel: 'noreferrer', title: '在新标签打开原图' }, '打开原图'),
            h('button', { className: 'rr-lb-btn', onClick: () => copyPath(path) }, '复制路径')),
          h('div', { className: 'rr-lb-stage', 'data-zoom': lightbox.fit ? 'fit' : 'full', onMouseDown: () => {} },
            h('img', { src: artifactUrl(path), alt: basename(path), draggable: false })),
          h('div', { className: 'rr-lb-hint' }, 'Esc 关闭 · ← → 切换 · 0 适应窗口'))
      }

      function renderPlots() {
        return h('div', { className: 'rr-plots', 'data-rr-plots': true },
          plots.length === 0
            ? h('div', { className: 'rr-plots-empty' }, '运行带 plot 的代码后，图会出现在这里。')
            : plots.map((path, index) => h('button', {
              key: `${path}-${index}`,
              className: 'rr-thumb',
              title: `${path}\n点击放大`,
              'data-rr-thumb': true,
              onClick: () => openLightbox(index)
            },
            h('img', { src: artifactUrl(path), alt: basename(path), loading: 'lazy' }),
            h('div', { className: 'rr-thumb-name' }, basename(path)))))
      }

      function renderStatus() {
        return h('div', { className: 'rr-status' },
          h('span', { className: 'rr-dot', 'data-on': status.running ? 'true' : 'false', 'data-busy': running ? 'true' : undefined }),
          h('span', { 'data-rr-session': true }, status.running ? `会话 ${status.pid}` : '会话未启动'),
          h('span', null, `Ln ${caret.line}, Col ${caret.col}`),
          h('span', { className: 'rr-spacer' }),
          probe !== null
            ? h('span', { title: String(probe.version ?? '') }, probe.ok ? String(probe.version ?? 'R').split(' -- ')[0] : 'R 不可用')
            : null,
          h('button', { className: 'rr-btn', onClick: () => setTreeOpen((value) => !value), 'data-rr-toggle-tree': true }, treeOpen ? '文件 ×' : '文件'),
          h('button', { className: 'rr-btn', onClick: () => setVarsOpen((value) => !value), 'data-rr-toggle-vars': true }, varsOpen ? '环境 ×' : '环境'))
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
            }, running ? '运行中…' : '▶ 运行'),
            h('button', {
              className: 'rr-btn',
              'data-rr-source': true,
              disabled: running || active === null,
              title: 'Run the whole file',
              onClick: runFile
            }, '运行全部'),
            h('button', {
              className: 'rr-btn',
              'data-rr-save-btn': true,
              disabled: active === null,
              onClick: () => saveActive(false)
            }, '保存')),
          h('div', { className: 'rr-group' },
            h('button', { className: 'rr-btn', 'data-rr-restart': true, onClick: restartSession }, '重启会话'),
            h('button', { className: 'rr-btn', 'data-rr-stop': true, onClick: stopSession, disabled: !status.running }, '停止')),
          h('div', { className: 'rr-group' },
            h('button', { className: 'rr-btn', 'data-rr-new-btn': true, onClick: newDraft }, '＋ 新建')),
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
          }, view === 'settings' ? '返回编辑器' : '设置'))
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
            h('h4', null, '工作区'),
            field('工作目录', 'workdir'),
            field('脚本保存目录', 'scriptDir'),
            field('运行文件时以文件所在目录为工作目录', 'runInFileDir', 'checkbox'),
            h('div', { className: 'rr-row' },
              h('span', { className: 'rr-row-label' }, '额外的文件夹'),
              h('div', { className: 'rr-roots' },
                roots.length === 0 ? h('span', { className: 'rr-hint' }, '（无）') : null,
                roots.map((root) => h('div', { className: 'rr-root-row', key: root },
                  h('span', { title: root }, root),
                  h('button', { className: 'rr-btn', onClick: () => removeRoot(root) }, '移除'))),
                h('button', { className: 'rr-btn', onClick: addRoot, style: { justifySelf: 'start' } }, '＋ 添加文件夹'))),
            config?.detected !== undefined
              ? h('div', { className: 'rr-hint' },
                `检测到的工作区：${config.detected.cwd} （${
                  config.detected.source === 'session' ? '来自当前会话'
                    : config.detected.source === 'registry' ? '来自注册工作区'
                      : '来自宿主进程目录'}）`)
              : null),
          h('div', { className: 'rr-section' },
            h('h4', null, '执行'),
            field('运行成功后自动保存', 'autoSave', 'checkbox'),
            field('超时（毫秒）', 'timeoutMs', 'number'),
            field('输出上限（字符）', 'maxOutputChars', 'number')),
          h('div', { className: 'rr-section' },
            h('h4', null, '图形'),
            field('宽（像素）', 'plotWidth', 'number'),
            field('高（像素）', 'plotHeight', 'number'),
            field('分辨率（dpi）', 'plotRes', 'number')),
          h('div', { className: 'rr-section' },
            h('h4', null, '环境变量'),
            field('JSON 对象', 'envJson', 'textarea')),
          h('div', { className: 'rr-section' },
            h('h4', null, '信息'),
            h('div', { className: 'rr-hint', 'data-rr-config-path': true }, `配置文件：${config?.configPath ?? '~/.dsh/r-runner.json'}`),
            h('div', { className: 'rr-hint' }, `会话：${status.running ? `进行中（pid ${status.pid}）` : '未启动'}`),
            h('div', { className: 'rr-hint' }, `驱动：${config?.driverPath ?? ''}`)),
          h('div', { className: 'rr-actions' },
            h('button', { className: 'rr-btn', 'data-primary': true, 'data-rr-save-config': true, onClick: saveConfig }, '保存配置'),
            h('button', { className: 'rr-btn', 'data-rr-reset-config': true, onClick: resetConfig }, '恢复默认'),
            h('button', { className: 'rr-btn', 'data-rr-restart-2': true, onClick: restartSession }, '重启会话')))
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
        renderLightbox())
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
    exports.__test = { tokenizeLine, setActiveCwd, withWorkspace, basename, dirname }
    return module.exports
  }
})
