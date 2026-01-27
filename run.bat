@echo off
chcp 65001 > nul
setlocal
title Scenario Editor

:: スクリプトのディレクトリに移動
cd /d "%~dp0"

:: サーバーの設定
set HOST=127.0.0.1
set PORT=8000
set URL=http://%HOST%:%PORT%

start "" "%URL%"

:: python -m uvicorn を使用することで PATH の問題を回避しやすくします
python -m uvicorn src.backend.main:app --host %HOST% --port %PORT% --reload

if %ERRORLEVEL% neq 0 (
    echo.
    echo [Error] Failed to start the server.
    echo Please check if Python and required libraries (fastapi, uvicorn, etc.) are installed.
    echo Install command: pip install -r requirements.txt
    echo.
    pause
)

endlocal
