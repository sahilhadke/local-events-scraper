@echo off
REM Fetch upcoming events from Meetup -> output\events-meetup.json
REM Self-contained: auto-launches Brave (debug port + shared profile) if needed.
REM Extra filters pass through, e.g.  fetch-meetup.bat --day today --distance 5
cd /d "%~dp0"
npx ts-node src/scripts/fetch.ts --source meetup %*
