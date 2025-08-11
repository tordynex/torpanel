# Använd en minimal Python-bild
FROM python:3.11-slim

# Sätt arbetskatalog
WORKDIR /app

# Kopiera beroenden och installera
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Kopiera all kod
COPY . .

# Exponera porten vi kör på (Render behöver denna)
EXPOSE 10000

# Starta FastAPI med Uvicorn
CMD ["sh", "-c", "python init_db.py && uvicorn app.main:app --host 0.0.0.0 --port 10000"]