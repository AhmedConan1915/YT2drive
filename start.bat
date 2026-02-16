@echo off
SETLOCAL EnableDelayedExpansion

:menu
cls
echo ==========================================
echo       YT2drive Automation Script
echo ==========================================
echo 1. Run Local Dev Server (Netlify Dev)
echo 2. Update and Push to GitHub (Master)
echo 3. Open Local Testing Guide
echo 4. Exit
echo ==========================================
set /p opt="Choose an option (1-4): "

if "%opt%"=="1" goto run_dev
if "%opt%"=="2" goto deploy
if "%opt%"=="3" goto guide
if "%opt%"=="4" goto end

:run_dev
echo.
echo Launching local server...
npm start
goto end

:deploy
echo.
set /p msg="Enter commit message: "
if "!msg!"=="" set msg="Update project"
echo.
echo Staging changes...
git add .
echo Committing: !msg!
git commit -m "!msg!"
echo Pushing to GitHub...
git push origin master
echo Done!
pause
goto menu

:guide
start notepad "C:\Users\Ahmed\.gemini\antigravity\brain\4c3a29f8-8f18-45d5-8ff5-8cd1f4aca224\local_testing_guide.md"
goto menu

:end
echo.
echo Goodbye!
pause
exit
