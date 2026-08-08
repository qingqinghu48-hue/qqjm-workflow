@echo off
cd /d "%~dp0"
chcp 65001 >nul
echo ============================================
echo  QINGQING JIAMENG - DAILY PUSH
echo  Committing and pushing your changes...
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push.ps1" > "%~dp0push_log.txt" 2>&1
type "%~dp0push_log.txt"
echo.
echo ============================================
echo  Done. If something went wrong, the log file
echo  "push_log.txt" in this folder has the reason.
echo ============================================
pause
