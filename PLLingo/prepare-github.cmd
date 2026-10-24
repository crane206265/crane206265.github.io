@echo off
setlocal
cd /d "%~dp0"
if exist ".tools\node.exe" (
  set "PATH=%~dp0.tools;%PATH%"
  ".tools\node.exe" ".tools\package\bin\npm-cli.js" run prepare:github
) else (
  call npm run prepare:github
)
exit /b %errorlevel%
