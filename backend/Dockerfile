FROM python:3.11-slim

# Ange arbetskatalogen till din backend
WORKDIR /app

# Kopiera bara requirements först och installera
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Kopiera all kod från backend-mappen in i containern
COPY backend/ .

# Exponera porten du använder
EXPOSE 10000

# Kör init_db.py och sen starta servern
CMD ["sh", "-c", "python init_db.py && uvicorn main:app --host 0.0.0.0 --port 10000"]
