@echo off
REM Launches Brave with CDP debug port 9222 using the SHARED profile from
REM amc-book-movie. Only one Brave instance can own this profile at a time —
REM if amc-book-movie's Brave is already running, you do NOT need to run this.
start "" "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="C:\Users\sahil\Desktop\Projects\amc-book-movie\playwright\.auth\brave-profile"
