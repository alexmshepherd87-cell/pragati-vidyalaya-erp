@echo off
title PRAGATI VIDYALAYA - Results Reveal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found. Opening file directly - some features may not work.
  echo Install Node.js or run from a machine with Node for full support.
  start "" "%~dp0index.html"
  timeout /t 3 >nul
  exit /b 0
)

start "" "http://127.0.0.1:8765"
node serve.js
