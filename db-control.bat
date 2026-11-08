@echo off
chcp 65001 >nul
title Market Hub - Development and local production
cd /d "%~dp0"
:MENU
cls
echo ===============================================================================
echo                 MARKET HUB - DEVELOPMENT / LOCAL PRODUCTION
echo ===============================================================================
echo.
echo   [1] Run app development server (npm run dev; configure root .env first)
echo   [2] Back up local production database and storage
 echo  [3] Open local production runbook
echo   [0] Exit
echo.
set /p choice="Choose an option: "
if "%choice%"=="1" goto DEV
if "%choice%"=="2" goto BACKUP
if "%choice%"=="3" goto GUIDE
if "%choice%"=="0" exit /b 0
echo Invalid option.
timeout /t 2 >nul
goto MENU
:DEV
call npm run dev
pause
goto MENU
:BACKUP
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-local-production.ps1
pause
goto MENU
:GUIDE
start notepad.exe "docs\deployment\2026-11-04-local-production-docker-runbook.md"
goto MENU
