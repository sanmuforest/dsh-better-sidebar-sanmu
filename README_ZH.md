# dsh-better-sidebar-sanmu

DSH（DeepSeek Harness）右侧边栏里的 **VSCode 式工作台**：左栏四组可折叠根项目（文件 / 灵感 / 任务 / Git），右侧固定编辑区，顶部是稳定的编辑器头部栏。

> Fork 自 [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) v0.28.2（MIT），保留其全部功能与 `ctx.betterSidebar` 服务契约，只在其上新增一个 `workbench` 页签。

## 安装

```powershell
dsh plugin --profile <profile> add dsh-better-sidebar-sanmu@<version>
```

或从本地 tarball 安装：

```powershell
dsh plugin --profile <profile> add file:F:\path\to\dsh-better-sidebar-sanmu-0.1.0.tgz
```

装完重启 Desktop（或硬刷新页面）。要求 DSH **0.2.1-rc.1+**（`engines.dsh: >=0.2.1-rc.1 <0.3.0`）。

> 本包与 `dsh-better-sidebar` 是同一份代码的两个包名：**二者只能装一个**。`cordis.patch.yml` 里的守卫会在检测到另一份已启用时自动退让，但推荐直接卸载旧包，避免 node_modules 里留两份。

## 功能

| 区域 | 说明 |
|---|---|
| 文件 | 复用上游文件树：懒加载、Git 着色、实时刷新、右键新建/改名/删除/上传、拖拽、引用到对话；点击文件在**右侧**打开（不开新的 DSH 页签） |
| 灵感 | `<workspace>/.dsh-whiteboard/` 下的 Markdown 列表；一键新建 `灵感-时间戳.md` 并打开；文件是普通 `.md`，AI 工具可直接读写 |
| 任务 | 嵌入上游任务管理页（子代理拓扑 / 团队任务板 / 后台任务） |
| Git | 嵌入上游 Source Control 页（变更 / 提交图 / 本轮文件） |
| 编辑器 | 上游 CodeMirror 6：语法高亮、Markdown/HTML 预览、`Ctrl/Cmd+S` 保存、mtime 冲突保护、未保存 `*` 标记、切换前「保存 / 不保存 / 取消」 |
| 浏览器 | 页签左侧的 🌐 调用宿主 `browser` kind（仅 desktop profile 有；缺失时按钮变 `!` 并给出原因） |

## 状态持久化

按会话存于 `localStorage['dsh-better-sidebar-sanmu:workbench:<sessionId>']`：折叠状态、左栏宽度、展开目录、上次打开的文件。

## 开发

```powershell
npm install            # 本机 pnpm 在 Windows 上会触发 symlinkAllModules 爆栈，改用 npm
node node_modules/typescript/bin/tsc -p tsconfig.build.json
node node_modules/tsdown/dist/run.mjs
npm pack --ignore-scripts
```

基线说明、各阶段实现与验收记录见 `docs/baseline-report.md`、`docs/phase-*.md`。

## License

MIT，见 [LICENSE](./LICENSE)。上游版权归 omdsh-dev。
