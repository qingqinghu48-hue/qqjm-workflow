<#
  push.ps1 —— 一键提交并推送 GitHub
  用法：
    .\push.ps1                 # 自动提交（信息=当前时间）并推送
    .\push.ps1 -m "修改了封面配色"
    .\push.ps1 -watch          # 监听模式：文件变化后自动推送
#>
param(
  [string]$m = "",
  [switch]$watch
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path

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
  exit 1
}
$gitRoot = Split-Path -Parent (Split-Path -Parent $script:gitExe)
$mingwBin = Join-Path $gitRoot "mingw64\bin"
if (Test-Path $mingwBin) {
  $env:PATH = "$mingwBin;$env:PATH"
  $env:GIT_EXEC_PATH = $mingwBin
}

$oldEA = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $script:gitExe config --global --add safe.directory "$repo" 2>&1 | Out-Null
$ErrorActionPreference = $oldEA

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
  & $script:gitExe -c "safe.directory=$repo" @GitArgs
}

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

function Push-Once([string]$msg) {
  Set-Location $repo
  Invoke-Git add -A
  $diff = Invoke-Git diff --cached --stat
  if (-not $diff) {
    Write-Host "[push] 没有可提交的修改" -ForegroundColor DarkGray
    return
  }
  if (-not $msg) { $msg = "update $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" }
  $oldEA3 = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $co = Invoke-Git commit -m $msg 2>&1
  $po = Invoke-Git push 2>&1
  $ErrorActionPreference = $oldEA3
  foreach ($line in @($co) + @($po)) {
    if ($line -is [System.Management.Automation.ErrorRecord]) {
      Write-Host $line.ToString() -ForegroundColor DarkGray
    } else {
      Write-Host $line
    }
  }
  if ($LASTEXITCODE -ne 0) { Write-Host "[push] 推送失败，请先运行 setup-and-push.ps1 检查令牌" -ForegroundColor Red; exit 1 }
  Write-Host "[push] 已推送：$msg" -ForegroundColor Green
}

if ($watch) {
  Write-Host "[watch] 监听中：$repo （文件变化后自动推送，Ctrl+C 退出）" -ForegroundColor Cyan
  $script:lastPush = Get-Date
  $script:dirty = $false
  $fsw = New-Object System.IO.FileSystemWatcher $repo
  $fsw.IncludeSubdirectories = $true
  $fsw.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::FileName -bor [System.IO.NotifyFilters]::Size
  $action = {
    if ($_.FullPath -match '\.git\\|push_log\.txt') { return }
    $script:dirty = $true
  }
  $fsw.add_Changed($action)
  $fsw.add_Created($action)
  $fsw.add_Deleted($action)
  $fsw.add_Renamed($action)
  $fsw.EnableRaisingEvents = $true
  while ($true) {
    Start-Sleep -Seconds 3
    if ($script:dirty -and ((Get-Date) - $script:lastPush).TotalSeconds -ge 10) {
      $script:dirty = $false
      try { Push-Once } catch { Write-Host "[watch] 推送失败：$_" -ForegroundColor Yellow }
      $script:lastPush = Get-Date
    }
  }
} else {
  Push-Once $m
}
