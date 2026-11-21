@echo off
if exist "%~dp0app\runtime\node.exe" (
  start "Sosigongbang" /min "%~dp0app\runtime\node.exe" "%~dp0app\launch.mjs"
) else (
  start "Sosigongbang" /min node.exe "%~dp0app\launch.mjs"
)
