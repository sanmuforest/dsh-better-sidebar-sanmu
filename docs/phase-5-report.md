# phase-5-report.md — 打包、安装复测与发布准备

> 2026-10-29 · 阶段五交付记录 · `dsh-better-sidebar-sanmu@0.1.0`

## 1. 包收尾

| 项 | 值 |
|---|---|
| name / version | `dsh-better-sidebar-sanmu` / `0.1.0` |
| `engines` | `node >=20`，**`dsh: ">=0.2.1-rc.1 <0.3.0"`**（本轮新增；执行文件写的 `0.21.0` 与实际版本线不符，已按宿主 `0.2.1-rc.3` 实况声明） |
| `dsh.bundle.patch` | `./cordis.patch.yml`（行 id `sanmu-workbench`） |
| 清单 id | `dsh-external/dsh-better-sidebar-sanmu`（与 client-registry bundle id 一致） |
| `files` | 补齐 **`dsh.plugin.json`**（此前漏打包，市场通道会缺清单）；lib 产物 / types / src / 图标 / 语言包 / README / LICENSE 均在 |
| README | 中英两份改写为 fork 版（安装、功能表、持久化、开发、上游归属） |
| `publishConfig` | 仍是 `{ "access": "public" }`，**未写死 registry**（等你给地址） |

打包结果：`npm pack` → **501 文件 / 6.1 MB（unpacked 23.9 MB）**，`npm publish --dry-run` 通过（语法、清单、文件集均被 npm 接受）。

## 2. 安装 / 卸载复测（本地 tarball）

| 动作 | 结果 |
|---|---|
| 卸载（remove_bundle） | `application: applied`，随后核查：profile `dependencies` 无残留、`dsh.profile.bundles` 无残留、`node_modules/dsh-better-sidebar-sanmu` 已删除、`cordis.patch.yml` 无 sanmu 行 → **T9 通过（本地）** |
| 安装（install_bundle `file:…tgz`） | `application: applied`、`warnings: []`；loader 行 `include:sanmu-workbench` 存在（Config.listConfigs 可查） |
| engines 门禁 | 带 `engines.dsh` 安装后宿主未拒绝，说明 `0.2.1-rc.3` 满足 `>=0.2.1-rc.1 <0.3.0` |
| 双挂载 | 上游 `dsh-better-sidebar` 已不在 profile；patch 守卫保留，若将来同时装两份会自动退让 |

> 与执行文件的偏差：本机 Desktop 不带 `dsh` CLI（asar 内只有 desktop-runtime），**无法创建 test profile**，所以安装复测在 `desktop` profile 内以「先卸后装」完成——这也是唯一不产生双挂载的路径。

## 3. T1–T10 现状

| 编号 | 项 | 状态 |
|---|---|---|
| T1 | 打包完整性 | **通过**（逐项校验 package.json / patch / lib 产物 / dsh.plugin.json / locale / icon） |
| T2 | 最小挂载 | 已通过（阶段一验收） |
| T3 | 四组折叠 | 已通过 |
| T4 | 文件新建 | 已通过（目标目录跟随 + 提示） |
| T5 | 编辑保存 | 已通过 |
| T6 | 灵感落盘 | 已通过（`.dsh-whiteboard/`） |
| T7 | 浏览器图标 | 已通过（宿主 `browser` kind，位于页签左侧） |
| T8 | 持久化 | 待你在本轮重启后最终确认 |
| T9 | 卸载干净 | **本地通过**（依赖/包目录/patch 行全清） |
| T10 | 基线兼容 | 待最终确认（原生文件/Git/任务/浏览器页签） |

## 4. 发布（等输入）

缺两项信息，暂不执行：

1. **registry 地址**（例如 `https://npm.your-domain.com/` 或 Verdaccio/Gitea 地址）
2. **认证方式**（`npm login` 交互，或写进仓库外 `.npmrc` 的 `//host/:_authToken=...`）

拿到后执行：

```powershell
# 项目内临时覆盖 registry，不改全局配置
npm publish --registry <你的registry> --cache .npm-cache --ignore-scripts
```

若 registry 需要 `publishConfig.registry` 固定，告诉我地址，我会写进 `package.json` 并重新打包；若是私有 scope（如 `@sanmu/dsh-workbench`），名称也需要一并改（含 `cordis.patch.yml`、`dsh.plugin.json`、tsdown 的 bundle id），这一步我可以一次改完。

## 5. 待你确认

- 重启后按 T8/T10 过一遍（折叠/宽度恢复、原生页签正常）。
- 给 registry 地址 + 认证方式，或明确「只保留本地 tarball，不发布」。
