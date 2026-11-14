# dsh-r-runner — 规划

一个把 R 开发环境搬进 DSH 右侧栏的插件：写代码、运行、看控制台、看变量、看图形，
不用切到 RStudio。界面参照 RStudio 的四象限组织，细节沿用 VS Code 的习惯
（标签页、面包屑、⌘S、⇧⌘R）。

> 状态：**v0.1.0 已实现并跑通**（`npm test` 全绿，宿主半已装进 desktop profile 并在线自检）。
> 本文档说明「为什么这样切分能力」和「接下来做什么」。

---

## 1. 目标与非目标

**要的**

- 在侧栏里**就地跑 R 代码**——不是起一次 `Rscript` 就退出，而是有一个常驻会话，
  变量、加载的包、图形设备都留在上下文里。
- 像 RStudio 那样**看得到全局环境**：变量名、类型、大小、值预览，双击能改。
- 像 VS Code 那样**编辑体验顺手**：多标签、面包屑、行号、高亮、⌘/Ctrl+Enter 运行选区。
- 图形不用额外窗口：每次 `plot` 落成 PNG，面板里出缩略图，点开看大图（agent 也能读路径）。
- 设置足够丰富：R 路径、参数、工作目录、额外文件夹、超时、图形尺寸/DPI、环境变量。

**不要的**

- 不做完整的 R 语言服务器（补全/跳转/诊断交给 `languageserver` + 未来的 LSP 桥）。
- 不接管 RStudio 的项目系统（只读地认 `.Rproj` 名字用于显示）；仍然只认「工作目录 + 若干额外文件夹」。
- 不在浏览器里跑 R（WASM 版 webR 作为可选后备，见路线图 P2）。

---

## 2. 能力是怎么切分的

DSH 插件分两半，边界由「谁有权限、谁有 UI」决定：

```
┌─────────────────────────────────────────────────────────────┐
│ 浏览器（右侧栏 tab，dsh-r-runner/lib/client.js）             │
│  编辑器 / 文件树 / 控制台 / 环境表 / 图形条 / 设置页         │
│  —— 只做 UI 与 localStorage 缓冲，不碰进程、不碰文件系统     │
└───────────────────────────┬─────────────────────────────────┘
                            │  fetch /r/api/*（?cwd= 带会话工作区）
┌───────────────────────────▼─────────────────────────────────┐
│ 宿主半（Node，dsh-r-runner/lib/index.js，inject 三服务）     │
│  webServer：注册 /r/api/* 路由                              │
│  subprocess：拉起并守住 R 会话                              │
│  workspaceRegistry：解析「当前会话的工作区」                 │
└───────────────────────────┬─────────────────────────────────┘
                            │  loopback TCP + 换行分隔 JSON
┌───────────────────────────▼─────────────────────────────────┐
│ R 进程（lib/driver.R，R --slave -f driver.R --args <port> …）│
│  命令：ping / run / vars / assign / rm / quit               │
│  每次 plot 落盘 .dsh-r-runner/plots/plot-<ts>-<pid>-NNN.png │
└─────────────────────────────────────────────────────────────┘
```

关键决策与理由：

| 决策 | 理由 |
| --- | --- |
| 常驻 R 进程，而不是每次 `Rscript -e` | 冷启动 ~0.4–1 s，但**变量会丢**。RStudio 的价值就在「上下文留存」。实测常驻后单次运行 1–40 ms。 |
| loopback TCP + JSON 行协议，而不是 stdin | `readLines(file("stdin"), n=1)` 在管道上会阻塞到 EOF（`-f` 模式下还会回显脚本），实测不可用；`serverSocket()` 是 base R ≥4.0，零依赖。 |
| 驱动脚本整体包进 `local({…})` | 否则驱动自己的 `args`/`sock`/辅助函数都会落进 `globalenv`，污染用户的环境表。 |
| `options(device=…)` 重定向到 PNG | 无窗口环境也能出图，且**每个 plot 都有文件路径**，UI 与 agent 都能直接引用。 |
| 宿主半只 import Node 内置模块 | DSH 0.2.2 起 profile 不再解析 `@deepseek-ai/dsh-tools`，宿主半 import 它会让插件**静默消失**（`fiberPhase: null`）。`test/import.mjs` 把这条限死。 |
| 客户端零构建（手写 ModuleLoader 包） | 不用打包器、不用 HMR，改一行 `lib/client.js` 刷新页面即生效；代价是没有 JSX，用 `h()`。 |

---

## 3. 已实现（v0.1.0）

**面板**

- 顶部工具栏：▶ 运行 / 运行全部 / 保存 / 重启会话 / 停止 / ＋ 新建 / 设置。
- 左侧文件树：懒加载、面包屑、↑ 上一级、刷新、＋ 文件夹（挂载额外目录）、隐藏文件开关。
- 编辑器：多标签、行号槽、语法高亮叠加层、Tab 缩进两空格、⌘/Ctrl+Enter 运行选区或整缓冲区、⌘S 保存。
- 底部左侧 **四个标签页**：控制台（stdout/stderr/错误分层显示、耗时、工作目录，底部一条 `>` 提示符可敲代码，`↑`/`↓` 翻历史）、历史（每次运行写入 `~/.dsh/r-runner-history.json`，点一行填回提示符）、帮助（`utils:::.getHelpFile` + `tools::Rd2txt` 渲染真实 R 文档）、数据（`data.frame`/`matrix`/向量的前 100 行表格，数字列右对齐，`<NA>` 标记）。
- 底部右侧：环境表（名称/值/类型/大小，双击改值；**表** 按钮把对象送进数据标签页）。
- 图形条：每次运行的 PNG 缩略图，点开大图，路径可复制。
- 状态条：会话徽章（pid/未启动）、Ln/Col、R 版本、文件/环境开关。

**宿主**

- `/r/api/*`：`state` `config` `run` `vars` `var` `tree` `stat` `file` `scripts` `save` `artifact` `session/restart` `session/stop` `roots` `history`（GET 列表 / POST 清空）`help?topic=` `data?name=`。
- agent 工具 `r_run({ code?, file?, name? })`：模型能直接跑 R，拿到控制台输出与图形路径。
- 会话自愈：进程退出后下次运行自动重启；配置变更后自动丢弃旧会话（参数可能变了）。

**工程**

- `npm test`：`import`（模块边界）、`driver`（真 R 会话往返）、`host-unit`（配置/路径策略/文件助手）、`client-tokenize`（高亮）、`client-smoke`（标签/槽位/词典/快捷键契约）。
- `bin/install-local.sh`、`bin/reload-host.sh`、`bin/check.mjs`（装完的在线自检）、`bin/preview-ui.mjs`（离线截图）。

---

## 4. 路线图

### P0 — 收尾（v0.1.x）

- [x] 运行历史：控制台提示符 `↑`/`↓` 翻历史，历史标签页列出全部记录。
- [x] Rmd 的「运行当前 chunk」：`chunkAt()` 解析围栏块，跑光标所在块（提示 `chunk 2/3 · L12-18`），无块时回退首个。
- [x] 数据查看器：环境表的「表」按钮 / 数据标签页 → 只读表格（前 100 行）。
- [x] 图形条：点缩略图 → **portal 浮窗**（`react-dom.createPortal` 到 `document.body`，侧栏不会裁切）：适应 ⇄ 100%、← → 切换、原图、复制路径。
- [x] 图形条：hover 删除单张（`×` / 浮窗「删除」）、「清空」（`POST /r/api/plot/delete|clear`，只动 `.dsh-r-runner/plots/*.png`）、环境面板「清空」（`rm(list = ls())`）。
- [x] 「全部图形」网格视图（工具条「图形 N」→ 卡片网格，可放大 / 删除）。
- [x] 英文文案接线：`UI.zh/en` 词典 + 设置页「界面语言」开关（工具条 / 标签页 / 表头 / 状态条 / 图窗 / 包面板）。
- [x] 包管理面板：已载入 / 已安装（可搜索、一键 `library()`）/ `install.packages()` 独立进程 + 日志 + 缺包提示。

### P1 — 像 IDE（v0.2）

- [x] **补全**（轻量版）：对象 + 已载入包导出 + base/关键字，`Ctrl+Space` 或 `.` `$` `::` 触发；`languageserver` 桥仍待做（P2）。
- [x] **诊断**：编辑后 700ms 跑 `parse(text=…)` + 三条 lint，行号槽圆点 + 状态条计数。
- [x] **跳转到定义**：`F12` / `⌘`-click → `getAnywhere()` 或 `source()` 文件的 `file:line`（srcref）。
- [x] 帮助面板：`?fun` / `help("fun")` 的文本渲染（`tools::Rd2txt`，已从 P1 提前做掉）。
- [x] Rmd 预览：`rmarkdown::render()` 到 `.dsh-r-runner/rmd`，面板内 iframe。

### P2 — 生态（v0.3+）

- [x] Shiny / Quarto 预览：`POST /r/api/app/start`（`shiny::runApp` + 空闲端口探测，iframe 内嵌，可停止）、`POST /r/api/quarto/render`；缺 shiny/quarto 时给安装提示。
- [x] 项目系统（只读）：`state.project` 认 `.Rproj`，设置页显示项目名，`scriptDir` 缺省跟随项目根 `<project>/R`。
- [ ] 远程 R：SSH 到服务器跑 driver（`R --slave` 远端 TCP 转发）。
- [ ] webR 后备：本机没装 R 时用 WASM 版跑纯计算型代码（无图形、无包）。
- [ ] 与 matlab-runner 抽公共层：会话进程管理、变量表、图形条、文件树都可复用。

---

## 5. 设置项（对应设置页五个分区）

| 分区 | 键 | 默认 | 说明 |
| --- | --- | --- | --- |
| R | `rBinary` | 自动探测 | 候选 `/usr/local/bin/R`、`/opt/homebrew/bin/R`、框架路径 |
| R | `rscriptBinary` | 自动探测 | 供未来 `Rscript` 一次性任务用 |
| R | `sessionArgs` | `""` | 追加到 `R --slave` 之后，例如 `--vanilla` |
| 工作区 | `workdir` | 当前会话工作区 | 运行目录、文件树根 |
| 工作区 | `scriptDir` | `<workdir>/R` | 「＋新建」草稿保存处 |
| 工作区 | `runInFileDir` | `true` | 运行文件时把 cwd 切到文件所在目录，相对路径才合理 |
| 工作区 | `extraRoots` | `[]` | 额外挂载的文件夹（树上平级显示，可读写） |
| 执行 | `autoSave` | `true` | 运行成功后回写打开的文件 |
| 执行 | `timeoutMs` | `600000` | 单次运行上限 |
| 执行 | `maxOutputChars` | `400000` | 控制台截断上限（超长输出保护 UI） |
| 图形 | `plotWidth`/`plotHeight`/`plotRes` | `960`/`640`/`110` | PNG 设备参数 |
| 环境变量 | `env` | `{}` | 传给 R 子进程的环境变量（JSON 对象） |

配置文件：`~/.dsh/r-runner.json`（相对于 `$DSH_HOME`）。

---

## 6. 已知限制

- **图形不是交互窗口**：每次 plot 是一张静态 PNG；`par(mfrow=c(2,2))` 会得到 4 张文件。
- **不支持 `readline()`/`browser()`**：会话的 stdin 不接用户输入。
- **`.Rmd` 运行当前 chunk，但不渲染**（不做 `rmarkdown::render()` 预览）。
- **不隔离**：R 进程以宿主用户身份运行，能读写工作区外的路径（`extraRoots` 只是白名单提示，不是沙箱）。
- **单会话**：一个插件实例一个 R 进程；并行跑多个项目需要重启会话或换 `workdir`。
- **macOS 已验证**；Linux/Windows 未测（`freePort`/进程组停止是 POSIX 逻辑，Windows 需另写）。

---

## 7. 发布计划

照搬 `dsh-matlab-runner` 的路径（已被市场收录，流程验证过）：

1. `npm test` 全绿 → `npm pack --dry-run` 检查 `files` 只含 `lib/ bin/ cordis.patch.yml README.md LICENSE`。
2. 发版前跑一遍 `bin/check.mjs`（真实 GUI）+ 新版 DSH 上跑 `test/import.mjs`。
3. `npm publish`（granular token：Read and write **publish and stage** + Bypass 2FA）。
4. 打 tag + GitHub Release（正文只写功能与升级提示，不写本机路径）。
5. 向 `awesome-dsh-plugin` 提 `data/plugins/seally-web__dsh-r-runner.yml`（`category: dev`，
   描述里写清依赖：需要本机 R；仓库满 1 天才过年龄门）。
6. 市场目录每日 02:23 UTC 构建 → 北京 ~12:30 出现；`bin/check-market.sh` 可自查。

---

## 8. 下一步（本次交付后）

1. 你在右侧栏打开 R 面板跑一段自己的代码，告诉我哪里别扭（缩进宽度？控制台高度？字体？）。
2. 剩余 P0：英文文案接线、包管理面板、「全部图形」网格。
3. 想要补全就上 P1 的 `languageserver` 桥——那是这个插件从「能跑」到「像 IDE」的分水岭。
