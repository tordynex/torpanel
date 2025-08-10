from app.models import Base
from app.database import engine

print("Skapar tabeller...")
Base.metadata.create_all(bind=engine)
print("Färdig.")