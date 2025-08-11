from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from app.routes import users, cars, customers, workshops, servicelogs
# from app import models  # bara om du behöver side-effects
# from app.database import Base, engine  # om du använder create_all

app = FastAPI(title="Autonexo API")

# CORS – lista exakta origins (lägg till dev-origin om du behöver)
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

# Basen är mappen där main.py ligger → upp två nivåer → frontend/dist/assets
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ASSETS_DIR = BASE_DIR / "frontend" / "dist" / "assets"
INDEX_FILE = BASE_DIR / "frontend" / "dist" / "index.html"

# Mounta assets
app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")

# API routes
app.include_router(users.router,       prefix="/users",       tags=["Användare / Users"])
app.include_router(cars.router,        prefix="/cars",        tags=["Bilar / Cars"])
app.include_router(customers.router,   prefix="/customers",   tags=["Kunder / Customers"])
app.include_router(workshops.router,   prefix="/workshops",   tags=["Verkstäder / Workshops"])
app.include_router(servicelogs.router, prefix="/servicelogs", tags=["Service Logs"])

# SPA fallback – fångar direkt-URLer som /workshop/servicelog och returnerar index.html
@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    index_path = Path("frontend/dist/index.html")
    if index_path.exists():
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="index.html not found")
