from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
import os
from dotenv import load_dotenv

# Ladda miljövariabler från .env
load_dotenv()

# Hämta databaskoppling från .env
DATABASE_URL = os.getenv("DATABASE_URL")

# Skapa engine och session factory
engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Basmodell (ej nödvändig här om du redan har den i models.py)
Base = declarative_base()

# Dependency som används i alla routes
def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
