from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from app.routes import users, cars, customers, workshops, servicelogs

app = FastAPI(title="Autonexo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://portal.autonexo.se",
        "https://www.portal.autonexo.se",
        "https://www.autonexo.se",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Hitta projektroten dynamiskt (funkar för både /app/app/main.py och /app/backend/app/main.py)
THIS = Path(__file__).resolve()
candidates = [p for p in THIS.parents if (p / "frontend" / "dist").exists()]
PROJECT_ROOT = candidates[0] if candidates else THIS.parents[2]  # fallback

DIST_DIR = PROJECT_ROOT / "frontend" / "dist"
ASSETS_DIR = DIST_DIR / "assets"
INDEX_FILE = DIST_DIR / "index.html"

# Montera assets bara om de finns (undvik crash före build)
if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")

# API routes
app.include_router(users.router,       prefix="/users",       tags=["Användare / Users"])
app.include_router(cars.router,        prefix="/cars",        tags=["Bilar / Cars"])
app.include_router(customers.router,   prefix="/customers",   tags=["Kunder / Customers"])
app.include_router(workshops.router,   prefix="/workshops",   tags=["Verkstäder / Workshops"])
app.include_router(servicelogs.router, prefix="/servicelogs", tags=["Service Logs"])

# SPA fallback – leverera byggd index.html för alla icke-API-vägar
@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    if INDEX_FILE.exists():
        return FileResponse(str(INDEX_FILE))
    raise HTTPException(status_code=404, detail="index.html not found (kör npm run build)")
