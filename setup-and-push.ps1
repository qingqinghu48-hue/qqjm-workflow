<#
  一键配置并推送 GitHub（用户手动运行）
  用法：右键 → 使用 PowerShell 运行
#>
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repo

# 自动定位 git（系统未安装时使用 Codex 内置版本）
$script:gitExe = $null
$cmd = Get-Command git -ErrorAction SilentlyContinue
if ($cmd) { $script:gitExe = $cmd.Source }
if (-not $script:gitExe) {
  foreach ($p in @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe",
    "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"
  )) {
    if (Test-Path $p) { $script:gitExe = $p; break }
  }
}
if (-not $script:gitExe) {
  Write-Host "未找到 Git。请先安装 Git for Windows：winget install Git.Git" -ForegroundColor Red
  Read-Host "按回车键关闭"
  exit 1
}

# 补全 Git 的 HTTPS 组件目录（内置版 Git 需要）
$gitRoot = Split-Path -Parent (Split-Path -Parent $script:gitExe)
$mingwBin = Join-Path $gitRoot "mingw64\bin"
if (Test-Path $mingwBin) {
  $env:PATH = "$mingwBin;$env:PATH"
  $env:GIT_EXEC_PATH = $mingwBin
}

# 信任当前目录（解决 Git 的所有权检查）
$oldEA = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $script:gitExe config --global --add safe.directory "$repo" 2>&1 | Out-Null
$ErrorActionPreference = $oldEA

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
  & $script:gitExe -c "safe.directory=$repo" @GitArgs
}

# 自动检测本机代理（系统代理 / 常见代理软件端口）
function Test-TcpPort([int]$port, [int]$timeoutMs = 300) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $iar = $c.BeginConnect("127.0.0.1", $port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne($timeoutMs)) { $c.Close(); return $false }
    $c.EndConnect($iar)
    $c.Close()
    return $true
  } catch { return $false }
}

$proxyUrl = $null
try {
  $inet = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -ErrorAction SilentlyContinue
  if ($inet.ProxyEnable -eq 1 -and $inet.ProxyServer) {
    $ps = $inet.ProxyServer.Trim()
    if ($ps -notmatch '^https?://') { $ps = "http://$ps" }
    $proxyUrl = $ps
  }
} catch {}
if (-not $proxyUrl) {
  foreach ($port in @(7078, 7890, 7897, 10809, 10808, 1080, 8080, 8888, 8889, 9910)) {
    if (Test-TcpPort $port) { $proxyUrl = "http://127.0.0.1:$port"; break }
  }
}
if ($proxyUrl) {
  $oldEA2 = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  Invoke-Git config --global http.proxy $proxyUrl 2>&1 | Out-Null
  Invoke-Git config --global https.proxy $proxyUrl 2>&1 | Out-Null
  $ErrorActionPreference = $oldEA2
  Write-Host "已检测到代理：$proxyUrl" -ForegroundColor Yellow
}

Write-Host "=== 清清聊加盟 · GitHub 一键推送 ===" -ForegroundColor Cyan
Write-Host ""

# 1. Git 身份
Invoke-Git config user.name "qingqinghu48-hue"
Invoke-Git config user.email "qingqinghu48-hue@users.noreply.github.com"
Write-Host "[1/4] Git 身份已配置" -ForegroundColor Green

# 2. 输入令牌（不会保存到磁盘）
if (-not $env:GH_TOKEN) {
  $env:GH_TOKEN = Read-Host "请输入 GitHub 令牌（ghp_ 开头）"
}

# 3. 添加远程仓库
$remote = "https://$($env:GH_TOKEN)@github.com/qingqinghu48-hue/qqjm-workflow.git"
$remotes = Invoke-Git remote
if ($remotes -contains "origin") {
  Invoke-Git remote remove origin
}
Invoke-Git remote add origin $remote
Write-Host "[2/4] 远程仓库已关联" -ForegroundColor Green

# 4. 提交并推送
Invoke-Git add -A
$diff = Invoke-Git diff --cached --stat
if ($diff) {
  Invoke-Git commit -m "init: 工作流部署 $(Get-Date -Format 'yyyy-MM-dd HH:mm')" 2>&1 | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -ne 0) { throw "git commit 失败" }
}
Invoke-Git push -u origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) {
  Write-Host "推送失败（请检查令牌是否过期或没有 repo 权限）" -ForegroundColor Red
  Write-Host "重新生成令牌：GitHub → Settings → Developer settings → Personal access tokens" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "如果错误是“无法连接 github.com”，说明网络需要代理：" -ForegroundColor Yellow
  Write-Host "  1. 打开你的代理软件（Clash / V2Ray 等）" -ForegroundColor Yellow
  Write-Host "  2. 如果代理端口不是常见的 7890/7897/1080/10809，告诉我端口号" -ForegroundColor Yellow
  Write-Host "  3. 或者手动执行：git config --global http.proxy http://127.0.0.1:<你的端口>" -ForegroundColor Yellow
  Invoke-Git remote set-url origin "https://github.com/qingqinghu48-hue/qqjm-workflow.git"
  Read-Host "按回车键关闭"
  exit 1
}
Write-Host "[3/4] 代码已推送到 GitHub" -ForegroundColor Green

# 5. 移除令牌，避免留在配置里
Invoke-Git remote set-url origin "https://github.com/qingqinghu48-hue/qqjm-workflow.git"
Write-Host "[4/4] 完成！令牌已从仓库配置中移除" -ForegroundColor Green
Write-Host ""
Write-Host "下一步：到 GitHub 仓库配置 3 个 Secrets（见操作手册第 2 步）" -ForegroundColor Yellow
Read-Host "按回车键关闭"
