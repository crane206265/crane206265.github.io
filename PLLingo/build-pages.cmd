@echo off
cd /d "%~dp0"
if exist ".tools\node.exe" (
  set "PATH=%~dp0.tools;%PATH%"
  ".tools\node.exe" ".tools\package\bin\npm-cli.js" run build:pages
) else (
  call npm run build:pages
)
