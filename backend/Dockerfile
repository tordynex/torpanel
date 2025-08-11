# ---------- 1) Bygg frontend ----------
FROM node:20 AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build
# -> ger /app/frontend/dist

# ---------- 2) Backend + runtime ----------
FROM python:3.11-slim

# (Valfritt men bra för vissa wheels, loggar m.m.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Installera backend-dependencies först (för bättre layer-cache)
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Kopiera backend-koden
COPY backend/ ./backend/

# Kopiera in byggd frontend från steg 1
COPY --from=frontend /app/frontend/dist ./frontend/dist

# Exponera port (Render läser denna)
EXPOSE 10000

# Starta: initiera DB och kör Uvicorn från backend/
CMD ["sh", "-c", "cd backend && python init_db.py && uvicorn app.main:app --host 0.0.0.0 --port 10000"]
