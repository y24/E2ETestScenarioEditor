@echo off
chcp 65001 > nul
setlocal
title E2E Scenario Editor

:: スクリプトのディレクトリに移動
cd /d "%~dp0"

:: サーバーの設定
set HOST=127.0.0.1
set PORT=8000
set URL=http://%HOST%:%PORT%

start "" "%URL%"

:: uvicorn でサーバーを起動
:: python -m uvicorn を使用することで PATH の問題を回避しやすくします
python -m uvicorn src.backend.main:app --host %HOST% --port %PORT%

if %ERRORLEVEL% neq 0 (
    echo.
    echo [Error] Failed to start the server.
    echo Please check if Python and required libraries (fastapi, uvicorn, etc.) are installed.
    echo Install command: pip install -r requirements.txt
    echo.
    pause
)

endlocal
