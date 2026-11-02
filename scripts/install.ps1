## =============================================================================
# dsh-better-sidebar-sanmu 一键安装脚本（官方 CLI 方式，Windows PowerShell 5.1+ / pwsh）
#
# 通过 DSH 官方插件命令安装 npm 包并自动挂载：
#   dsh plugin --profile <profile> add dsh-better-sidebar-sanmu@<version>
#
# 包内声明了 dsh.bundle.patch（cordis.patch.yml）：CLI 的 bundle 协调会把它
# 自动加进 profile 的 dsh.profile.bundles，下次启动即挂载——无需手动写
# cordis.patch.yml 挂载行。符合仓库硬约束：不修改 DSH 源码，插件永远作为
# 独立包被 profile 引用。
#
# 用法（任选其一）：
#   # 默认最新版
#   $script = (irm 'https://raw.githubusercontent.com/sanmuforest/dsh-better-sidebar-sanmu/main/scripts/install.ps1').TrimStart([char]0xFEFF)
#   & ([scriptblock]::Create($script))
#   # 指定版本 / 装完重启
#   $script = (irm 'https://raw.githubusercontent.com/sanmuforest/dsh-better-sidebar-sanmu/main/scripts/install.ps1').TrimStart([char]0xFEFF)
#   & ([scriptblock]::Create($script)) -Version 0.1.1 -Restart
#   # 本地保存后运行
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Version 0.1.1 -DryRun
#
# 参数：
#   -Version    npm 版本号/范围，缺省 latest（自动解析为最新）。
#   -Profile    目标 profile 名（缺省 web）；安装与修复模式均适用。
#   -Restart    装完后尝试 `pm2 restart dsh-web`（无 pm2 时仅提示）。会断开当前页面会话。
#   -DryRun     只打印将要执行的操作，不写任何文件。
#
# 环境变量（均可省略）：
#   DSH_HOME    默认 %USERPROFILE%\.dsh
#   REGISTRY    默认 https://registry.npmjs.org
#   DSH_CMD     默认优先 PATH 上的 dsh，缺省回退 npx -y --package @deepseek-ai/dsh@<见 $DSH_NPX_SPEC>
#
# 说明：
# - **安装前会校验 dsh CLI 版本**：低于 $DSH_BASELINE 时直接中止并给出升级命令。
#   宿主的安装器拿「执行安装的那份 CLI 版本」比对插件 peer 下限，太旧就整批拒绝并
#   回滚，界面上表现为「插件报异常、被停用」。npm 全局那份 CLI 常落后于桌面 App，
#   所以这一步必须前置，不能等宿主来报错。
# - pnpm 11 的 minimumReleaseAge 会拒绝发布 <24h 的新版本。脚本会预写
#   minimumReleaseAgeExclude（幂等），放行本插件，避免"重跑一次才成功"。
# - 老版本（<0.10.2）用手动挂载行，bundle 通道激活后需移除，否则双挂载。
#   脚本会幂等移除本插件的挂载行。
# =============================================================================
param(
  [string]$Version = '',
  [switch]$Restart,
  [switch]$DryRun,
  [string]$Profile = 'web'
)

$PKG = 'dsh-better-sidebar-sanmu'
$REGISTRY = if ($env:REGISTRY) { $env:REGISTRY } else { 'https://registry.npmjs.org' }

# 本插件要求的最低宿主版本。与 package.json 的 engines.dsh 下限、13 条
# @deepseek-ai/dsh-* peer 下限同源；抬基线时这三处必须一起改。
# 为什么要在装之前自己判一次：宿主的安装器拿「执行安装的那份 dsh CLI 的版本」
# 去比对插件的 peer 区间，低于下限就整批拒绝并回滚（原文：
# "installation rejected: Plugin … is incompatible with dsh 0.2.0-rc.2"）。
# 而 npm 全局那份 CLI 经常落后于桌面 App（本机实测：App 0.2.1-rc.5，CLI 0.2.0-rc.2），
# 于是用户看到的是"插件报异常、被停用"，其实是安装被拒。
$DSH_BASELINE = '0.2.1-rc.1'
# npx 兜底拉取的 CLI。npm 上的 latest 目前是 0.2.1-rc.5；抬基线时同步这一处。
$DSH_NPX_SPEC = '0.2.1-rc.5'

# DSH_HOME：DSH_HOME 环境变量 > %USERPROFILE% > $HOME
if ($env:DSH_HOME) {
  $DSH_HOME = $env:DSH_HOME
} elseif ($env:USERPROFILE) {
  $DSH_HOME = Join-Path $env:USERPROFILE '.dsh'
} else {
  $DSH_HOME = Join-Path $HOME '.dsh'
}
$PROFILE_DIR = Join-Path $DSH_HOME "profiles\$Profile"
$WS_YML = Join-Path $PROFILE_DIR 'pnpm-workspace.yaml'
$PATCH_YML = Join-Path $PROFILE_DIR 'cordis.patch.yml'

function Say([string]$m)  { Write-Host "[install] $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "[warn] $m" -ForegroundColor Yellow }
function Die([string]$m)  { Write-Host "[error] $m" -ForegroundColor Red; exit 1 }

# 解析版本 -> npm spec（"x.y.z" / "^x.y.z" / latest）
function Resolve-Spec {
  param([string]$Given)
  if ([string]::IsNullOrWhiteSpace($Given) -or $Given -eq 'latest') {
    $v = $null
    foreach ($tool in @('npm', 'pnpm')) {
      if (Get-Command $tool -ErrorAction SilentlyContinue) {
        $v = (& $tool view $PKG version "--registry=$REGISTRY" 2>$null | Select-Object -Last 1)
        if ($v) { break }
      }
    }
    if ($v) { return ([string]$v).Trim() }
    Warn '无法联网解析最新版本（npm/pnpm 查询失败），回退为 latest，由 pnpm 直接解析。'
    Warn '若已知版本号，可显式传入：-Version 0.10.2'
    return 'latest'
  }
  return $Given
}

# 把 "0.2.1-rc.5" 解析成可逐项比较的键；无法解析返回 $null。
# 只覆盖本仓库需要的形状：X.Y.Z、X.Y.Z-<alpha|beta|rc>.N（含无预发布后缀）。
function ConvertTo-VersionKey {
  param([string]$Text)
  $t = ([string]$Text).Trim().TrimStart('v')
  $m = [regex]::Match($t, '^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z]+)\.(\d+))?')
  if (-not $m.Success) { return $null }
  $stage = 9
  $pre = 0
  if ($m.Groups[4].Success) {
    switch ($m.Groups[4].Value.ToLowerInvariant()) {
      'alpha' { $stage = 0 }
      'beta' { $stage = 1 }
      'rc' { $stage = 2 }
      default { $stage = 1 }
    }
    $pre = [int]$m.Groups[5].Value
  }
  return @([int]$m.Groups[1].Value, [int]$m.Groups[2].Value, [int]$m.Groups[3].Value, $stage, $pre)
}

# CLI 版本低于基线时直接给出可操作的提示，而不是让宿主抛一段英文 peer 列表。
# 探测不到（DSH_CMD 是自定义命令、走 npx 兜底、或 --version 不可用）就放行：
# 此时真正安装的 CLI 由 npx 指定，本脚本无从判断。
function Assert-DshCliVersion {
  param([string]$Cli)
  if ($Cli -ne 'dsh') { return }
  $raw = (& dsh --version 2>$null | Select-Object -Last 1)
  if ($LASTEXITCODE -ne 0 -or -not $raw) { return }
  $actual = ([string]$raw).Trim()
  $actualKey = ConvertTo-VersionKey $actual
  $minKey = ConvertTo-VersionKey $DSH_BASELINE
  if ($actualKey -eq $null -or $minKey -eq $null) {
    Warn "无法解析 dsh CLI 版本（输出：$actual），跳过版本校验。"
    return
  }
  for ($i = 0; $i -lt 5; $i++) {
    if ($actualKey[$i] -gt $minKey[$i]) { return }
    if ($actualKey[$i] -lt $minKey[$i]) {
      Warn "本机 dsh CLI 版本为 $actual，低于本插件要求的最低版本 $DSH_BASELINE。"
      Warn '宿主的安装器会以「incompatible with dsh …」拒绝安装并回滚，界面上则表现为插件报异常、被停用。'
      Warn "请先升级 CLI 后重试（npm 上当前 latest 为 $DSH_NPX_SPEC）："
      Warn "  npm i -g @deepseek-ai/dsh@$DSH_NPX_SPEC"
      Warn '或改用桌面 App 自带的插件管理器安装（它用的是 App 自己的宿主版本）。'
      Die "dsh CLI 太旧（$actual < $DSH_BASELINE），已在改动 profile 之前中止。"
    }
  }
}

# 组装 dsh CLI：优先 PATH 上的 dsh，缺省 npx 拉官方包
function Get-DshCli {
  if ($env:DSH_CMD) { return $env:DSH_CMD }
  if (Get-Command dsh -ErrorAction SilentlyContinue) { return 'dsh' }
  if (Get-Command npx -ErrorAction SilentlyContinue) { return 'npx' }
  return $null
}

# 步骤 1（安装与修复共用）：预写 workspace 设置（幂等），保证 pnpm 不拦截
# 放行本插件新版本（0.20.0 起插件不再依赖需要构建脚本的包，allowBuilds 无需再动）
function Ensure-WorkspaceSettings {
  $wsScript = @'
const fs = require("fs");
const p = process.argv[2];
const pkg = process.argv[3];
let t = fs.readFileSync(p, "utf8");
const before = t;
const entry = new RegExp("^\\s*-\\s+" + pkg + "\\s*$", "m");
if (!entry.test(t)) {
  if (/^\s*minimumReleaseAgeExclude:\s*$/m.test(t)) {
    t = t.replace(/^(\s*minimumReleaseAgeExclude:\s*)$/m, "$1\n  - " + pkg);
  } else {
    t += "\nminimumReleaseAgeExclude:\n  - " + pkg + "\n";
  }
}
if (t !== before) fs.writeFileSync(p, t);
console.log(t === before ? "unchanged" : "updated");
'@
  # PowerShell 5.1 把含内嵌双引号的多行 JS 作为参数传给 `node -e` 时，引号会被
  # Windows 命令行解析吞掉，导致 JS 语法错误（Expected ',', got ':'）。
  # 改用临时文件方式，兼容 PS 5.1 与 pwsh 7。
  $wsJs = Join-Path $env:TEMP ("dshbs-ws-" + [guid]::NewGuid().ToString("N") + ".js")
  # 显式写成无 BOM：`Set-Content -Encoding UTF8` 在 Windows PowerShell 5.1 下
  # 会加 BOM，而 BOM 是 DSH 启动崩溃的已知来源（profile 清单被同类写法写坏过）。
  [IO.File]::WriteAllText($wsJs, $wsScript, (New-Object Text.UTF8Encoding($false)))
  $wsOut = node $wsJs "$WS_YML" "$PKG" 2>&1
  $wsCode = $LASTEXITCODE
  Remove-Item -LiteralPath $wsJs -Force -ErrorAction SilentlyContinue
  $wsResult = (($wsOut | Out-String)).Trim()
  if ($wsCode -ne 0) { Die "处理 $WS_YML 失败（node 退出码 $wsCode）：$wsResult" }
  if ($wsResult -eq 'updated') {
    Say "已确保 $WS_YML：minimumReleaseAgeExclude（$PKG）"
  } else {
    Say 'workspace 设置已就绪，跳过'
  }
}

# 前置校验
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Die '未找到 node（DSH 运行需要 Node.js >= 20），请先安装 Node.js 并加入 PATH。'
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Die '未找到 pnpm；安装脚本需要 pnpm >= 10。请先安装或升级 pnpm 并加入 PATH。'
}
$pnpmVersion = (& pnpm --version 2>$null | Select-Object -Last 1)
if ($LASTEXITCODE -ne 0 -or -not $pnpmVersion) {
  Die '无法读取 pnpm 版本；安装脚本需要 pnpm >= 10。'
}
$pnpmVersionText = ([string]$pnpmVersion).Trim()
$pnpmMajor = 0
if (-not [int]::TryParse(($pnpmVersionText -split '\.')[0], [ref]$pnpmMajor)) {
  Die "无法解析 pnpm 版本（输出：$pnpmVersionText）；安装脚本需要 pnpm >= 10。"
}
if ($pnpmMajor -lt 10) {
  Die "安装脚本需要 pnpm >= 10；当前版本为 $pnpmVersionText。请升级 pnpm 后重试。"
}
if (-not (Test-Path $PROFILE_DIR)) {
  Die "找不到 profile 目录：$PROFILE_DIR（请先安装并运行过一次 dsh web）"
}
if (-not (Test-Path $WS_YML)) {
  Die "找不到 $WS_YML（请先初始化 $Profile profile）"
}

$SPEC = Resolve-Spec $Version
$CLI = Get-DshCli
if (-not $CLI) {
  Die '未找到 dsh 或 npx。请先安装 DSH（并确保 Node/npm 可用），或用 DSH_CMD 指定。'
}
Assert-DshCliVersion $CLI
Say "目标：$CLI plugin --profile $Profile add $PKG@$SPEC（profile: $PROFILE_DIR）"

if ($DryRun) {
  Say "[dry-run] 步骤 1：确保 $WS_YML 含 minimumReleaseAgeExclude（$PKG）"
  Say "[dry-run] 步骤 2：执行 $CLI plugin --profile $Profile add $PKG@$SPEC（安装 + bundle 自动注册）"
  Say "[dry-run] 步骤 3：校验 dsh.profile.bundles 含 $PKG"
  Say "[dry-run] 步骤 4：幂等移除 $PATCH_YML 里旧的 better-sidebar 手动挂载行（上游/旧版；bundle 通道接管，避免双挂载）"
  if ($Restart) { Say '[dry-run] 步骤 5：pm2 restart dsh-web' } else { Say '[dry-run] 步骤 5：提示用户手动重启 DSH' }
  exit 0
}

# 步骤 1：预写 workspace 设置（幂等），放行本插件新版本
Ensure-WorkspaceSettings

# 步骤 2：官方 CLI 安装 + bundle 自动注册（含挂载）
if ($CLI -eq 'dsh') {
  $cliArgs = @('plugin', '--profile', $Profile, 'add', "$PKG@$SPEC")
} else {
  $cliArgs = @('-y', '--package', "@deepseek-ai/dsh@$DSH_NPX_SPEC", 'dsh', 'plugin', '--profile', $Profile, 'add', "$PKG@$SPEC")
}
Say "执行 $CLI plugin --profile $Profile add $PKG@$SPEC ..."
$addOut = & $CLI @cliArgs 2>&1
$addCode = $LASTEXITCODE
$addOut | ForEach-Object { $_ }
if ($addCode -ne 0) {
  $addText = ($addOut | Out-String)
  $rejected = [regex]::Match($addText, 'incompatible with dsh ([0-9A-Za-z.\-]+)')
  if ($rejected.Success) {
    # 宿主拒绝安装：拿 CLI 自身版本比对插件 peer 下限失败，整批回滚。
    Warn "安装被宿主拒绝：本插件要求 dsh >= $DSH_BASELINE，而执行安装的 CLI 是 $($rejected.Groups[1].Value)。"
    Warn "请先升级 CLI（npm 上当前 latest 为 $DSH_NPX_SPEC）："
    Warn "  npm i -g @deepseek-ai/dsh@$DSH_NPX_SPEC"
    Warn '或改用桌面 App 自带的插件管理器安装，然后重跑本脚本。'
    exit 1
  }
  Warn 'dsh plugin add 失败。已预写 minimumReleaseAgeExclude，仍失败的可能原因：'
  Warn '  - 网络/登录问题：npm registry 不可达或需要登录。'
  Warn "  - 依赖安装冲突：可手动重试 cd $PROFILE_DIR; pnpm install。"
  exit 1
}

# 步骤 3：校验 bundle 已注册（挂载生效的判据）
$pkgJson = Get-Content -Raw (Join-Path $PROFILE_DIR 'package.json') | ConvertFrom-Json
$bundles = $pkgJson.dsh.profile.bundles
if ($bundles -notcontains $PKG) {
  Warn "$PKG 未出现在 dsh.profile.bundles 中——挂载未注册。"
  Warn "若上面的 pnpm 输出提示 ignored build scripts，请确认 $WS_YML 的 allowBuilds 后重跑本脚本（0.20.0 起本插件自身不再有构建脚本依赖）。"
  exit 1
}
Say "bundle 已注册：dsh.profile.bundles 包含 $PKG（下次启动自动挂载）"

# 步骤 4：幂等移除旧的 manual 挂载行（避免与 bundle 双挂载）
$mountScript = @'
const fs = require("fs");
const p = process.argv[2];
const lines = fs.readFileSync(p, "utf8").split("\n");
const out = [];
let i = 0;
let removed = false;
while (i < lines.length) {
  const line = lines[i];
  if (/^[ \t]*- insert:\s*$/.test(line)) {
    const block = [line];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== "" && !/^-\s/.test(lines[j])) {
      block.push(lines[j]);
      j++;
    }
    if (block.some((l) => /id:\s*better-sidebar\b/.test(l))) {
      while (out.length && /^[ \t]*#/.test(out[out.length - 1])) out.pop();
      i = j;
      removed = true;
      continue;
    }
  }
  out.push(line);
  i++;
}
if (!removed) {
  console.log("none");
} else {
  const t = out.join("\n").replace(/\n{3,}/g, "\n\n");
  fs.writeFileSync(p, t);
  console.log("removed");
}
'@
$mountJs = Join-Path $env:TEMP ("dshbs-mount-" + [guid]::NewGuid().ToString("N") + ".js")
[IO.File]::WriteAllText($mountJs, $mountScript, (New-Object Text.UTF8Encoding($false)))
$mountOut = node $mountJs "$PATCH_YML" 2>&1
$mountCode = $LASTEXITCODE
Remove-Item -LiteralPath $mountJs -Force -ErrorAction SilentlyContinue
$mountResult = (($mountOut | Out-String)).Trim()
if ($mountCode -ne 0) { Die "处理 $PATCH_YML 失败（node 退出码 $mountCode）：$mountResult" }
if ($mountResult -eq 'removed') {
  Say "已从 $PATCH_YML 移除旧的 better-sidebar 手动挂载行（bundle 通道接管挂载）"
} else {
  Say '无旧手动挂载行，跳过'
}

Say "安装完成：$PKG@$SPEC"

# 步骤 5：重启提示
if ($Restart) {
  if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    Say '重启 dsh-web（pm2）...'
    pm2 restart dsh-web
    if ($LASTEXITCODE -ne 0) { Warn 'pm2 restart 失败，请手动重启 DSH' }
  } else {
    Warn '未找到 pm2，请手动重启 DSH（如：pm2 restart dsh-web 或 dsh web）'
  }
} else {
  Say '下一步：重启 DSH 并硬刷新（Ctrl+Shift+R / Cmd+Shift+R）使新副本生效。'
  if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    Say '本机可用：pm2 restart dsh-web（会短暂断开当前页面会话）'
  }
}
