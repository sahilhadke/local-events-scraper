@echo off
cd /d "%~dp0"
echo Running local events scraper...
npm run scrape-only -- --day any --type in-person --distance 10 > output\scrape-log.txt 2>&1
echo Done. Check output\scrape-log.txt for results.
pause
