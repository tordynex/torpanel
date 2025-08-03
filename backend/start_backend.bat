@echo off
REM Startar backend i virtuell miljö

echo Aktiverar virtual environment...
call venv\Scripts\activate.bat

REM Kolla att uvicorn är installerat
echo Kontrollerar att Uvicorn finns...
where uvicorn >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo ❌ Uvicorn är inte installerat. Installerar nu...
    pip install uvicorn
)

REM Starta servern
echo Startar FastAPI-servern...
uvicorn app.main:app --reload

pause
