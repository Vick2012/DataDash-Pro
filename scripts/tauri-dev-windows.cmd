@echo off
REM Delega en PowerShell (rutas con espacios y VS "incompleto").
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tauri-dev-windows.ps1"
exit /b %ERRORLEVEL%
