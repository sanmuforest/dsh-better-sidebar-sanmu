# phase-2-report.md — 四组折叠、文件树与灵感

> 2026-10-29 · 阶段二交付记录 · `dsh-better-sidebar-sanmu@0.1.0`

## 1. 实现内容

| 执行文件要求 | 实现 |
|---|---|
| 四个可折叠根项目（文件 / 灵感 / 任务 / Git），标题栏点击切换 | `Section.tsx`：整条标题是 `<button aria-expanded>`，箭头旋转 90°，键盘可操作；折叠只卸载 body，不保留隐藏轮询 |
| 文件：复用基线文件树，渲染当前会话工作区 | `FilesSection.tsx` 直接 import 上游 `FileTree`（零 `ctx` 依赖的组件）；cwd 走 `useSessionRoot`（跟随 host 的 worktree 判定），回落 `scope.cwd` |
| 文件：新建文件 / 新建文件夹 | 两种入口：① section 顶部显式按钮（行内输入，Enter 提交 / Esc 取消）；② 保留树自带右键「新建文件 / 新建文件夹」 |
| 文件：点击在右侧内容区打开 | `onOpenFile` 不再走 `ctx.betterSidebar.openTab`（那会开宿主 tab），而是写入 workbench 的 `openPath`，在右栏渲染 |
| 灵感：固定目录 + 列出 .md + 新建 | `<workspace>/.dsh-whiteboard/`；`fs.tree` 只取 `.md`；「+ 新建灵感」先 `fs.mkdir`（已存在则忽略）再 `fs.createFile`，命名 `灵感-YYYYMMDD-HHmm.md`，可自定义；创建后立即在右栏打开 |
| 任务 / Git：复用对应面板 | `TasksSection` → 上游 `SubagentView`；`GitSection` → 上游 `ChangesTab`（传入合成 tab 记录 `workbench:git`）；两者都包在 `RenderBoundary` 里，单块崩溃只影响该 section |
| 折叠状态持久化、按会话隔离 | `state.ts`：`localStorage['dsh-better-sidebar-sanmu:workbench:<sessionId>']` 存 `leftWidth / collapsed / expanded / openPath`；每次变更即写 |
| 右侧内容区 | `FilePane.tsx`：`fs.read` 读取，文本以等宽 `<pre>` 只读预览（>200 KB 截断并提示）；二进制 / 超大文件给明确说明。**编辑与保存按计划在阶段三接入 CodeMirror** |

另：文件树右键「引用到对话」已接通 `referenceInChat`；上传保留（`api.uploadFile` 逐个上传后刷新）。

## 2. 自测

| 编号 | 项 | 结果 |
|---|---|---|
| 构建 | `tsc -p tsconfig.build.json` | **exit 0** |
| 打包 | `tsdown` + `npm pack` | **exit 0**，4.68 MB / 496 文件 |
| T1 | tarball 完整性 | **通过**（同阶段一 + 新增源码） |
| T3 | 四组折叠 | **待人工验收** |
| T4 | 新建文件/文件夹落盘 | **待人工验收** |
| T5 | 编辑保存 | 阶段三 |
| T6 | 灵感 .md 落盘 | **待人工验收**（目录 `.dsh-whiteboard/`） |
| T8 | 刷新后折叠/宽度恢复 | **待人工验收** |
| T10 | 基线原 tab 正常 | **待人工验收**（文件 / Git / 任务 / 侧边对话应仍在） |

## 3. 验收步骤

1. 硬刷新页面（Ctrl+Shift+R）；若入口消失再重启 Desktop。
2. 打开「工作台」：左栏应出现 **文件 / 灵感 / 任务 / Git** 四行；文件默认展开，其余折叠。
3. 文件：点一行文件 → 右侧显示只读内容；点「+ 文件」输入 `notes.md` 回车 → 文件落盘且右侧自动打开；「+ 文件夹」同理。
4. 灵感：展开 → 「+ 新建灵感」→ 在 `<当前工作区>/.dsh-whiteboard/` 下生成 `灵感-*.md` 并打开。
5. 任务 / Git：展开后应看到上游面板内容（受 52vh 高度限制，可内部滚动）。
6. 折叠任意两节、拖动分隔条 → 刷新页面，状态应恢复。
7. 右侧栏原有页面（文件 / Git / 任务 / 侧边对话 / 浏览器）应仍可正常打开。

## 4. 已知限制 / 风险

- 右栏为**只读预览**，编辑/保存/Ctrl+S 在阶段三。
- 任务与 Git 面板是按「整页」设计的组件，塞进 52vh 的 section 后信息密度偏高；若观感不可接受，阶段四再调布局（或改为「打开完整页」按钮 + 精简摘要）。
- 灵感目录尚未做 `.gitignore` 建议，落到用户工作区里可能进 Git 变更；阶段四处理（可选）。
- 折叠后 section body 卸载，重新展开会重新拉取（任务/Git 会重新初始化，属预期）。
