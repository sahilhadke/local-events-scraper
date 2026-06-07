@echo off
REM Fetch upcoming events from Eventbrite -> output\events-eventbrite.json
REM Self-contained: auto-launches Brave (debug port + shared profile) if needed.
REM Extra filters pass through, e.g.  fetch-eventbrite.bat --day this-weekend --distance 10
cd /d "%~dp0"
npx ts-node src/scripts/fetch.ts --source eventbrite %*
