# phase-1-report.md — fork 初始化与最小可运行骨架

> 2026-10-29 · 阶段一交付记录
> 基线：`dsh-better-sidebar` v0.28.2（`b0e0fab`，MIT）
> 产物：`dsh-better-sidebar-sanmu@0.1.0`

---

## 1. 本阶段做了什么

| 项 | 内容 |
|---|---|
| fork 内容 | 基线 v0.28.2 全量源码（src / tests / docs / 构建脚本）铺入本仓库，`baseline-report.md` 一并入库 |
| 包身份 | `package.json` name → `dsh-better-sidebar-sanmu`，version → `0.1.0`；repository 指向 sanmuforest 仓库 |
| 挂载 | `cordis.patch.yml`：行 id `sanmu-workbench`，模块名 `dsh-better-sidebar-sanmu`；保留双挂载守卫（见下） |
| 市场清单 | `dsh.plugin.json` id → `dsh-external/dsh-better-sidebar-sanmu` |
| 客户端 bundle id | `tsdown.config.ts` 两处 `clientBundle(...)` 改为新包名 / 新清单 id —— **这是本轮最关键的改名**：bundle id 必须等于 `package.json#name`，否则客户端模块表注册不上 |
| 宿主身份常量 | `src/index.ts`：`export const name`、`SIDEBAR_PACKAGE_NAME` 改为新包名（后者被 loader 行名比对使用） |
| 新增页面 | `src/client/workbench/`：`WorkbenchTab.tsx`（左栏占位 + 右栏空状态 + 可拖分隔条）、`index.tsx`（`TabDescriptor`，id `workbench`）、`workbench.module.css`（只用 DSH 主题令牌） |
| 注册点 | `src/client/index.tsx`：`service.registerTab(workbenchTab())`，走与外部插件完全相同的 `ctx.betterSidebar` 服务 |

**未改**：服务契约（`registerTab` / `registerFileViewer` / `openTab` 等）、宿主路由、上游内置 6 tab、偏好命名空间（`dsh-better-sidebar*` 存储键保留，避免丢用户偏好）。

## 2. 构建与安装（含本机环境绕行）

| 步骤 | 结果 |
|---|---|
| 依赖安装 | pnpm 11.8.0（仓库 pin）在本机 **两条 lane 都崩**：`[symlinkAllModules] Maximum call stack size exceeded`；且 `prepare` 脚本 spawn 被沙箱拒绝（EPERM）。改用 **npm install --ignore-scripts --legacy-peer-deps**（本地 cache `.npm-cache`，因为默认 `%LOCALAPPDATA%\npm-cache` 不可写）→ 594 包成功 |
| 类型检查 | `node node_modules/typescript/bin/tsc -p tsconfig.build.json` → **exit 0** |
| 打包 | `node node_modules/tsdown/dist/run.mjs` → **exit 0**，`lib/` 产出 13 个文件（client.js 1.5 MB / client-mermaid.js 7.0 MB / index.js 0.37 MB …） |
| tarball | `npm pack --ignore-scripts` → `dsh-better-sidebar-sanmu-0.1.0.tgz`（4.65 MB，482 文件） |
| 安装 | 本机 Desktop **不带 `dsh` CLI**（asar 内只有 desktop-runtime，无 `@deepseek-ai/dsh` bin），无法建 test profile；改用 `plugin_manager` 装入当前 `desktop` profile |

安装顺序（保证无双挂载）：
1. `remove_bundle dsh-better-sidebar`（卸载上游 0.28.1）
2. `install_bundle file:…/dsh-better-sidebar-sanmu-0.1.0.tgz`

两次操作均 `application: applied`、`warnings: []`。装后 loader 行：`include:sanmu-workbench`（`Config.listConfigs` 可查，schema 正常投影）。
profile 现状：`dependencies` 只剩 `dsh-better-sidebar-sanmu` + `dsh-whale-widget`，`dsh.profile.bundles` 中上游行已消失。

> ⚠️ 与执行文件的偏差：执行文件要求「测试 profile 安装」，本机无 CLI 无法创建测试 profile，故改为**在 desktop profile 内用 fork 替换上游**（同一 profile 内两者互斥，替换是唯一不产生双挂载的路径）。卸载上游后，其全部功能由 fork 原样承接。

## 3. 自测结果

| 编号 | 项 | 状态 |
|---|---|---|
| T1 | 打包完整性：tarball 含 `package.json`、`cordis.patch.yml`、`lib/index.js`、`lib/client.js`、`lib/client-registry.js`、`icon.svg`、`locale/zh.json` | **通过**（逐项 tar -tf 校验） |
| T2 | 最小挂载：侧边栏出现工作台入口 | **待人工重启后确认**（宿主已 applied，客户端 bundle 需新页面加载） |
| T3 | 四组折叠 | 阶段二实现，本阶段为占位容器 |
| T4–T10 | — | 后续阶段 |

## 4. 人工验收步骤（重启后）

1. 完全退出并重启 DSH Desktop（DSH 不自行重启）。
2. 打开右侧栏 → `+` 新建页 → 应出现 **「工作台」**（图标为底部面板样式，order 15，位于「文件」与「Git」之间）。
3. 打开后应看到：左侧灰色标题栏「Workbench」+ 占位文案；右侧空状态「内容区 / 选择文件后在此打开」；中间 5px 分隔条可拖动（也可聚焦后用 ←/→ 调宽）。
4. 右侧栏原有页面（文件 / Git / 任务 / 侧边对话）应仍可用。

## 5. 回退方法（若挂载失败）

```
plugin_manager remove_bundle  dsh-better-sidebar-sanmu
plugin_manager install_bundle  dsh-better-sidebar@0.28.1
```

或直接恢复备份：`_backup\dsh-config-2026-10-29\profile-desktop\` 下的 `package.json` / `cordis.patch.yml`（然后重启）。

## 6. 已知限制 / 下一阶段输入

- 左侧宽度暂为组件内 state（阶段四持久化）。
- 左栏只有占位容器，四组根项目（文件 / 灵感 / 任务 / Git）在阶段二接入。
- 右侧内容区无头部栏按钮（浏览器图标在阶段三）。
- 面板宽度受 DSH 原生右侧栏宽度控制；默认宽度下左右两栏偏窄，验收时可先把侧栏拖宽。
