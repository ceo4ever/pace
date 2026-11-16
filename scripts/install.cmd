@echo off
rem PACE install launcher (Windows). .cmd files are not subject to the PowerShell execution policy,
rem so this runs install.ps1 with Bypass for this process only. Arguments pass through (-Yes, -DryRun, -Repo, -Ref).
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
exit /b %ERRORLEVEL%
