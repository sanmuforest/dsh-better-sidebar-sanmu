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
