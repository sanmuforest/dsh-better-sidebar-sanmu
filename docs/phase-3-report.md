# phase-3-report.md — 右侧编辑器与浏览器入口

> 2026-10-29 · 阶段三交付记录 · `dsh-better-sidebar-sanmu@0.1.0`

## 1. 实现内容

| 执行文件要求 | 实现 |
|---|---|
| 右侧集成 CodeMirror 6（复用基线编辑器配置） | 新增 `EditorPane.tsx`：`fs.read` 载入后直接渲染上游 `TextEditor`（即基线里 native 编辑器用的同一个组件），因此语法高亮、Markdown/HTML 预览、JSONL 卡片、超大文件分页预览、`Mod-s` 键位、mtime 冲突保护全部继承 |
| 编辑、Ctrl/Cmd+S 保存 | `TextEditor` 自身绑定 `Mod-s`（编辑态聚焦编辑器时生效）；头部「保存」按钮通过 `onToolbarControls.save()` 触发同一路径 |
| 切换文件时未保存确认 | 编辑器的 `onToolbarState.dirty` 上报到工作台；`requestOpen` / 关闭前若 `dirty`，弹 `ConfirmDialog`「有未保存的修改 / 丢弃并继续」 |
| 顶部自定义头部栏，位于编辑器上方、不遮挡内容 | `.editorHead` 是 flex 兄弟节点而非绝对定位：文件名校验 + 未保存圆点 + 预览/编辑切换 + 保存 + 🌐 + 关闭；编辑器在下方独立滚动 |
| 头部右侧浏览器图标，点击打开浏览器标签 | 调用宿主 `ctx.sidebarRight.openTab('browser', { params: {} })`（desktop profile 的 `ui-sidebar-browser`，kind `browser`），`try/catch` 兜底；无该 kind 时头部下方给出可关闭的错误提示，不静默失败 |
| 文件名稳定、切换文件时头部不跳 | 头部只依赖 `openPath` 与工具栏状态；编辑区通过 `key={openPath}` 重挂载，头部不重建 |

**沿用上一轮的修复**：加载不再受 `visible` 门控；effect 只依赖 `sessionId + cwd`，请求内用 ref 取活 scope（避免 5s cwd 刷新导致反复中断）。

## 2. 自测

| 编号 | 项 | 结果 |
|---|---|---|
| 构建 | `tsc -p tsconfig.build.json` | **exit 0** |
| 打包 | `tsdown` + `npm pack` | **exit 0**，4.68 MB / 496 文件 |
| T5 | 编辑后 Ctrl/Cmd+S 落盘，重新打开内容一致 | **待人工验收** |
| T7 | 点击浏览器图标打开浏览器标签 | **待人工验收** |
| 未保存切换确认 | 编辑 → 点另一个文件 | **待人工验收** |
| T1/T2/T3/T4/T6 | 前序能力不回退 | **待人工验收** |

## 3. 验收步骤（Ctrl+Shift+R 硬刷新）

1. 点开一个有内容的文件：右侧应出现 CodeMirror（Markdown 默认预览，头部有「编辑」按钮）。
2. 点「编辑」→ 改几个字 → 头部出现 ● 与「保存」→ 按 Ctrl+S 或点「保存」→ 提示保存成功后关闭再打开，内容应为新值。
3. 有未保存修改时点左侧另一个文件 → 应弹「有未保存的修改」，取消则留在原文件，确认则切换。
4. 点头部 🌐 → 应在右侧栏打开宿主浏览器页签（带地址栏）；若没装/不可用，会显示错误提示而不是静默。
5. 回归：文件/灵感/任务/Git 四节、新建文件（含目标目录提示）、灵感新建仍正常。

## 4. 已知限制 / 待确认

- 浏览器页签通过 `openTab('browser', { params: {} })` 打开**空白起始页**（宿主显示地址栏）。宿主对 `(kind, address)` 去重：连续点击可能聚焦同一个空白页签而非新增；若你要求「每次都是新页签」，下一轮改为按序生成独立种子（或改用宿主 `browser.new` 命令）。
- 目前 `TextEditor` 的预览/编辑切换按文件类型自动决定（Markdown 默认预览，代码默认编辑）；头部按钮仅在支持切换的类型上出现。
- 二进制 / 超大文件仍只给说明，不支持在工作台内编辑（上游编辑器对超大文件也只给分页只读预览）。
