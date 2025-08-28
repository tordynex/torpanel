# init_db.py
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

# ---- FIX FÖR USER ROLE (ENUM + lowercase) ----
# ---- FIX FÖR USER ROLE (ENUM + lowercase) ----
print("Normaliserar användarroller + säkerställer ENUM-typ...")

with engine.begin() as conn:
    # 1) Skapa enum-typen om den saknas
    conn.execute(text("""
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'userrole') THEN
        CREATE TYPE userrole AS ENUM ('owner','workshop_user','workshop_employee');
      END IF;
    END$$;
    """))

    # 2) Sänk värden till gemener OCH casta till enum
    conn.execute(text("""
    UPDATE users
    SET role = LOWER(role::text)::userrole
    WHERE role IS NOT NULL AND role::text <> LOWER(role::text);
    """))

    # 3) Om kolumnen INTE är av enum-typen -> casta om den
    conn.execute(text("""
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name='users' AND column_name='role' AND udt_name <> 'userrole'
      ) THEN
        ALTER TABLE users
          ALTER COLUMN role TYPE userrole
          USING LOWER(role::text)::userrole;
      END IF;
    END$$;
    """))

    # 4) Sätt default till enum-värdet
    conn.execute(text("""
    ALTER TABLE users
      ALTER COLUMN role SET DEFAULT 'workshop_user'::userrole;
    """))

print("Färdig.")
