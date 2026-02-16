@echo off
echo ===================================================
echo     UTube2Drive Local Development Environment
echo ===================================================

REM Check for Netlify CLI
where netlify >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Netlify CLI is not installed.
    echo Installing Netlify CLI...
    npm install -g netlify-cli
)

REM Check for .env file
if not exist .env (
    echo [INFO] .env file not found. Creating from template...
    copy .env.template .env
    echo [WARNING] Please updated .env with your credentials!
    notepad .env
    pause
)

REM Install Dependencies
if not exist node_modules (
    echo [INFO] Installing dependencies...
    npm install
)

REM Start Local Server
echo [INFO] Starting local development server...
echo [INFO] Access the app at: http://localhost:8888
netlify dev
