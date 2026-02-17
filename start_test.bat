@echo off
echo Starting Client and Server...
echo Ensure you have filled .env with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
echo.
start "Netlify Dev" cmd /k "netlify dev"
echo.
echo waiting for netlify to start...
timeout /t 10
echo Opening Browser...
start "" "http://localhost:8888"
