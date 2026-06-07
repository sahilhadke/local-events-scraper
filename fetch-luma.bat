@echo off
REM Fetch upcoming events from Luma -> output\events-luma.json
REM Self-contained: auto-launches Brave (debug port + shared profile) if needed.
REM Extra filters pass through, e.g.  fetch-luma.bat --day this-week --type any
cd /d "%~dp0"
npx ts-node src/scripts/fetch.ts --source luma %*
