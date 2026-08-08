@echo off
cd /d "%~dp0"
chcp 65001 >nul
echo ============================================
echo  QINGQING JIAMENG - AUTO PUSH WATCHER
echo  Watching for changes... (keep this window open)
echo  Close this window to stop auto push.
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push.ps1" -watch
pause
