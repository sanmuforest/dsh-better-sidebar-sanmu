# dsh-better-sidebar-sanmu

A **VSCode-style workbench** inside the DSH (DeepSeek Harness) right sidebar: four collapsible roots on the left (Files / Inspiration / Tasks / Git) and a fixed editor pane on the right, under a stable editor header.

> Fork of [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) v0.28.2 (MIT). Every upstream feature and the `ctx.betterSidebar` service contract are kept; this fork adds one `workbench` tab type.

## Install

```powershell
dsh plugin --profile <profile> add dsh-better-sidebar-sanmu@<version>
```

Or from a local tarball:

```powershell
dsh plugin --profile <profile> add file:F:\path\to\dsh-better-sidebar-sanmu-0.1.0.tgz
```

Restart Desktop (or hard-refresh the page) afterwards. Requires DSH **0.2.1-rc.1+** (`engines.dsh: >=0.2.1-rc.1 <0.3.0`).

### Check the CLI version first

`dsh plugin add` judges the plugin against the version of **the CLI that runs the install**, not against the running app. The global `npm i -g @deepseek-ai/dsh` copy often lags several releases behind the Desktop app, and an older CLI refuses the install outright:

```
dsh: installation rejected: Plugin dsh-better-sidebar-sanmu@… is incompatible with dsh 0.2.0-rc.2 …
dsh: restored package.json, pnpm-lock.yaml, and node_modules.
```

The plugin then shows up as "disabled" in the UI even though nothing was ever mounted. Check and upgrade:

```powershell
dsh --version                     # must be >= 0.2.1-rc.1
npm i -g @deepseek-ai/dsh@0.2.1-rc.5
```

Or install through the Desktop app's own plugin manager, which uses the app's bundled host. `scripts/install.ps1` / `scripts/install.sh` run this check up front and stop before touching the profile.

#### The `desktop` profile is CLI-unwritable

```
error: profile "desktop" is managed exclusively by the Electron application
```

Same on `0.2.0-rc.2` and `0.2.1-rc.5`: the desktop application owns that profile, so `dsh plugin` only writes `web` and custom profiles. Use the in-app plugin manager for Desktop. This package is not published to npm yet (`npm view dsh-better-sidebar-sanmu` returns 404), so the only Desktop route today is mounting the local tarball by hand: add it to `dependencies` and `dsh.profile.bundles` in `~/.dsh/profiles/<profile>/package.json`, then `pnpm install` in that directory. **Write that manifest as BOM-free UTF-8** — `ConvertTo-Json | Set-Content -Encoding UTF8` in Windows PowerShell adds a BOM, and the host then dies in `readProfileManifest` (`Unexpected token '锘?`) before any plugin loads.

> This package and `dsh-better-sidebar` are two names for the same code: install **only one**. The `cordis.patch.yml` guard backs this row off when another copy is enabled, but uninstalling the old package is recommended.

## Features

| Area | Behaviour |
|---|---|
| Files | Upstream tree (lazy levels, Git colouring, live watch, context-menu create/rename/delete/upload, drag & drop, reference-to-chat). Clicking a file opens it in the RIGHT pane, not in a new DSH tab |
| Inspiration | Markdown notes under `<workspace>/.dsh-whiteboard/`; one click creates `灵感-<timestamp>.md` and opens it. They are ordinary `.md` files the agent can read/write |
| Tasks | Embeds the upstream task page (subagent topology, team board, background jobs) |
| Git | Embeds the upstream Source Control page (changes, graph, session lens) |
| Editor | Upstream CodeMirror 6: highlighting, Markdown/HTML preview, `Ctrl/Cmd+S`, mtime-conflict protection, `*` dirty mark, Save / Discard / Cancel before switching |
| Browser | The 🌐 chip at the tab's left edge opens the host `browser` kind (desktop profile only; shows `!` with a reason when absent) |

## Persistence

Per conversation, under `localStorage['dsh-better-sidebar-sanmu:workbench:<sessionId>']`: folded sections, rail width, expanded directories, last opened file.

## Development

```powershell
npm install            # pnpm hits symlinkAllModules stack overflow on this Windows host
node node_modules/typescript/bin/tsc -p tsconfig.build.json
node node_modules/tsdown/dist/run.mjs
npm pack --ignore-scripts
```

Baseline and per-phase records live in `docs/`.

## License

MIT — see [LICENSE](./LICENSE). Upstream copyright belongs to omdsh-dev.
