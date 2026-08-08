@echo off
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
copy /y "%~dp0自动推送.vbs" "%STARTUP%\QQJM_自动推送.vbs" >nul
echo ============================================
echo  INSTALLED! Auto push will start on every boot.
echo  From now on: edit files, they push automatically.
echo  (You can also run "自动推送.bat" to start now)
echo ============================================
pause
