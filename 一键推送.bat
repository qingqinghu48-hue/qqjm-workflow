@echo off
cd /d "%~dp0"
del /q push_log.txt 2>nul
chcp 65001 >nul
echo ============================================
echo  QINGQING JIAMENG - GitHub PUSH TOOL
echo  Please wait...
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-and-push.ps1" > "%~dp0push_log.txt" 2>&1
type "%~dp0push_log.txt"
echo.
echo ============================================
echo  FINISHED. If something went wrong, the log
echo  file "push_log.txt" in this folder has the reason.
echo ============================================
pause
