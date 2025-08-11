from sqlalchemy import text, inspect
from app.database import engine
from app.models import Base

print("Skapar tabeller (endast nya)...")
Base.metadata.create_all(bind=engine)

insp = inspect(engine)
cols = [c["name"] for c in insp.get_columns("workshops")]
if "autonexo" not in cols:
    print("Lägger till kolumn 'autonexo' i 'workshops'...")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE workshops ADD COLUMN autonexo boolean NOT NULL DEFAULT true;"))
        conn.execute(text("ALTER TABLE workshops ALTER COLUMN autonexo DROP DEFAULT;"))
print("Färdig.")
