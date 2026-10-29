# baseline-report.md — 阶段零：基线锁定与环境审计

> 生成时间：2026-10-29 · 执行者：DSH · 目标：《DSH Workbench 插件开发执行文件》
> 本报告只陈述**已核实的事实**；未核实项单独标注「待实测」。

---

## 1. 基线锁定（结论先行）

| 项 | 值 | 证据 |
|---|---|---|
| fork 基线仓库 | `omdsh-dev/DSH-better-sidebar`（MIT） | 仓库 LICENSE |
| **fork 基线 tag** | **v0.28.2** | `git ls-remote --tags` |
| **fork 基线 commit** | **`b0e0fab50e68f54b07a1fc1e7898030409c7d979`** | 本地 clone `git log -1`（tag 对象 `3a945d911ef5`） |
| 基线版本号 | `dsh-better-sidebar@0.28.2` | tag 内容 |
| 宿主兼容声明 | 13 条 `@deepseek-ai/dsh-*` peer 均为 `^0.2.1-rc.1`；无 `engines.dsh` | `package.json` / registry metadata |
| 本机宿主 | **DSH Desktop 0.2.1-rc.3**（ProductVersion 0.2.1.0） | `DeepSeek Harness.exe` VersionInfo |
| 兼容判定 | **兼容**（`^0.2.1-rc.1` 含 rc.3；本机 profile 已装 0.28.1 并运行中） | 版本区间 + 现场安装 |

**为什么不是「最新 tag 但更保守」**：v0.28.2 是当前最新正式 tag，与已装 0.28.1 同一支持线（peers 完全一致），只含冷 cwd 读修复，不改变布局能力边界；v0.28.1 与 v0.28.2 的 peer 下限逐条相同，因此取 v0.28.2 不引入额外风险，且能拿到最新修复。**没有回退到更早 tag**，原因见 §3.4。

本地基线副本（只读参考，未修改）：`F:\蓝色大肥鱼\DSH测试\_ref\DSH-better-sidebar-0.28.2`
fork 仓库（空仓，待阶段一填充）：`F:\蓝色大肥鱼\DSH测试\dsh-better-sidebar-sanmu`

---

## 2. 环境审计

| 项 | 实测 | 判定 |
|---|---|---|
| Node（系统） | v26.1.0 | 满足 `^22.19.0 \|\| >=24.0.0` |
| Node（DSH 运行时自带） | v24.21.0 | 满足 |
| pnpm | **不在 PATH**；自带 `…\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs` v11.28.5 | 用 `node <pnpm.mjs>` 调用，阶段一写入命令模板 |
| DSH Desktop | 0.2.1-rc.3，profile `desktop` 正常启动 | 满足 |
| 当前 profile 插件 | `dsh-better-sidebar@0.28.1`、`dsh-whale-widget`（bundles 里均已挂载） | ⚠️ 与 fork 双挂载冲突，阶段一必须先卸原插件 |
| `dsh-mindmap` | **未安装** | 「灵感」section 首版只做 .md 列表；脑图联动列为可选依赖 |
| 网络 | GitHub 需 `git -c http.sslBackend=openssl`（schannel 报 `SEC_E_NO_CREDENTIALS`），走本机代理 `127.0.0.1:7897`；npm registry 需 `NODE_USE_ENV_PROXY=1` + `HTTPS_PROXY` | 已跑通：registry 200、tag 列表可取 |
| 沙箱/备份 | `~/.dsh` 共 724 MB（含 sessions/attachments）；已备份**配置面**到 `_backup\dsh-config-2026-10-29`（settings/credentials/profile 的 package.json、cordis.patch.yml、lock） | 满足「防污染」目的；未复制会话数据（非配置，且体积大） |

---

## 3. 组件可复用性清单

### 3.1 硬事实：右列已归 DSH，插件不再自绘右侧容器

- **v0.19.0-alpha.0 起，DSH 右侧栏完全属于宿主**（`ctx.sidebarRight` / `ctx.sidebarRightTabs`）；插件把每个 `TabDescriptor` 注册为**原生 tab 类型（kind = descriptor.id）+ 原生 tab 体**。插件自绘容器只剩**底部工作台**。（`docs/external-plugin-guide.md` §0，第 16–49 行）
- 因此「重写外壳层」在 0.28.2 上**不成立**：外壳是 DSH 的，插件只能决定 **tab 体内**渲染什么。这正好是执行文件风险表里的降级路径「在单个 tab 内用 CSS 实现左右分栏」——但在当前基线里它不是降级，而是**唯一可行且完全自控**的做法。

### 3.2 复用清单

| 部件 | 源码位置 | 复用方式 | 结论 |
|---|---|---|---|
| 文件树 | `src/client/FileTree.tsx:493` | `export function FileTree(props: {...})`；**零 `ctx` 依赖**，仅吃 `sessionId/cwd/expanded/revealed/onToggle/onOpenFile/onReferenceFile/refreshTick/onUploadRequest/busy/hidden/visible/exclude`，数据走 `api` 单例 | **直接 import** |
| 文件操作（列目录/读/写/新建/改名/删除/上传） | 客户端 `src/client/api.ts`；宿主 `src/fs-*.ts` 路由 `/sidebar/api/*`、`/sidebar/file`、`/sidebar/ws/*` | 用 `api.*` 调用，路由随插件 host 半一起发布 | **直接复用** |
| 文本编辑器（CodeMirror 6） | `src/client/TextEditor.tsx:130`，签名 `TextEditor(props: FileViewerProps)` | 需 `ctx / store / scope / path / content / mtimeMs`；CodeMirror 走懒加载 chunk `lib/client-editor.js`；保存走 `fs.write`（含 mtime 冲突检测、行尾还原） | **复用，需自建加载/保存壳**（不套 `EditorHost`） |
| 编辑器宿主 | `src/client/EditorHost.tsx:116` | 强耦合 `SidebarStore` + `SidebarTab` + 预览/大文件/工具栏状态机 | **不复用**（我们要固定编辑区，不要它那套 tab 语义） |
| Git 面板 | `src/client/changes/ChangesTab.tsx` | 签名 `ChangesTab({ctx, store, scope, tab, visible, onOpenFile, onOpenDiff}: TabComponentProps)` | **可直接嵌入**（传宿主给的 props） |
| 任务面板 | `src/client/SubagentView.tsx` | `SubagentView({sessionId, active, ctx, store, onOpenChild})` | **可直接嵌入** |
| 浏览器 | **宿主 kind `browser`**（`@deepseek-ai/dsh-client-ui-sidebar-browser`，**仅 desktop profile 挂载**） | `ctx.sidebarRight.openTab('browser', { params: { url } })`，**必须 try/catch**（该包未挂时 throw；web profile 无此 kind） | **调用宿主 API**，不自研 iframe 浏览器 |
| 对外服务 | `src/client/service.ts:622` `registerTab(descriptor): () => void`；`apply()` 内 `ctx.provide('betterSidebar', service)` | 保留不动，外部消费插件（dsh-mindmap 等）零改动 | **原样保留**（满足决策 B） |
| 底部工作台 | `src/client/Sidebar.tsx` | 自绘分栏树，仅底部 | 不用于本插件页面 |
| 偏好/持久化 | `src/client/prefs.ts` + `prefs-shared.ts`（按会话） | 折叠状态/宽度可另存 localStorage 或搭它的 prefs | 阶段四处理 |

### 3.3 tab 体拿到的能力（决定工作台怎么实现）

`TabComponentProps`（`src/client/service.ts:146`）：`ctx`、`store`、`scope`、`tab`、`visible`，外加 `onToggleDir/onReferenceFile/onOpenFile/onOpenDiff/onSubagentJump`。
→ 工作台组件可以用 `ctx.betterSidebar.*`、`ctx.sidebarRight.*`、`ctx.sessions`、`api.*`，并把 `ctx/store/scope` 直接透传给 `TextEditor` / `ChangesTab` / `SubagentView`。

### 3.4 「自绘四折叠」的可行性判定

| 候选做法 | 判定 |
|---|---|
| A. 注册一个新原生 tab `workbench`，**tab 体内自绘** 左四折叠 + 右内容区 + 可拖分隔条 | **可行，推荐**。自绘范围 = tab 体，合法且不碰宿主外壳；服务层不动 |
| B. 用 `bottomOnly` 类型，落在插件自有底部工作台（整块版面、分栏可控） | **可行但位置不符**（底部而非右侧栏），作为备选 |
| C. 回退到仍保留自绘右侧面板的旧 tag（≤v0.18.x） | **否决**：旧 tag 的 peer 是 0.1.x/0.2.0 线，对 0.2.1-rc.3 会被宿主预检静默 `disabled`，装不上；且 v0.19.0 起相关代码已删除 |

**布局实现位置结论**：`src/client/workbench/` 新增自绘组件（左四折叠 + 右内容区 + splitter），以一个 `id: 'workbench'` 的 `TabDescriptor` 注册；不使用上游 `Sidebar.tsx` 的分栏树。

---

## 4. 关键风险（阶段一前必须知道）

1. **双挂载**：profile 现有 `dsh-better-sidebar@0.28.1` 与 fork 都会注册 `/sidebar/api` + `ctx.betterSidebar` → 启动报「duplicate prefix route」。阶段一安装 fork 前，必须先从 `desktop` profile 卸载/摘除原包（保留 whale-widget）。
2. **面板宽度**：原生右侧栏宽度由 DSH 控制，tab 只能填满它。默认宽度下「左树 + 右编辑器」两栏偏窄，需要用户拖宽侧栏。**待阶段一实测**该宽度是否可接受（不可接受则退回方案 B）。
3. **keepMounted**：原生 tab 体挂载后常驻，轮询/监听必须按 `visible` 门控（上游 AGENTS §5「稳态开销」），否则文件树 watch、Git 轮询会在切走后继续跑。
4. **版本线**：宿主 0.2.1-rc.3 高于基线声明下限 rc.1，本机 0.28.1 已证明可跑，但 rc.2→rc.3 的 API 面未逐条 diff；阶段一首次挂载若报缺失服务，先查 `inject` 列表。

---

## 5. 阶段零验收对照

- [x] `baseline-report.md` 明确写出 fork 基线 = **v0.28.2 / b0e0fab**
- [x] 文件树 / 编辑器 / Git / 浏览器 / 任务面板 各自的可复用方式已列（直接 import / 复用需适配 / 调用宿主 API / 不复用）
- [x] 「四折叠布局」实现位置已写明：**新增原生 tab `workbench`，在 tab 体内自绘**（不是上游布局组件、不是插件底部工作台）

## 6. 待人工决策（阶段一前）

**请确认布局方案**：
- **A（推荐）**：单个 `workbench` tab 内自绘左右两栏 —— 符合「侧边栏内部」、改动最小、保留服务兼容；代价是宽度受宿主侧栏控制。
- **B（备选）**：放到插件自有底部工作台 —— 版面完全可控、可自由分栏；但不在右侧栏，与「侧边栏内部」的目标有偏差。

确认 A 后我进入阶段一：fork v0.28.2 源码 → 改包名/版本 → 加 `workbench` tab 骨架（左右两栏 + 可拖分隔条）→ 构建打包 → 测试 profile 安装验证。
