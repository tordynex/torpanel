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

print("Normaliserar användarroller + säkerställer ENUM-typ...")

with engine.begin() as conn:
    conn.execute(text("""
    DO $$
    DECLARE
      have_type  boolean;
      has_lower  boolean;
      has_upper  boolean;
    BEGIN
      SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname='userrole') INTO have_type;

      IF have_type THEN
        SELECT
          BOOL_OR(enumlabel='owner') AS has_lower,
          BOOL_OR(enumlabel='OWNER') AS has_upper
        INTO has_lower, has_upper
        FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
        WHERE t.typname='userrole';

        -- Gamla varianten med VERSALER? Migera till gemener.
        IF has_upper AND NOT has_lower THEN
          -- ta bort default så vi kan byta typ
          ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
          -- gör kolumnen till text
          ALTER TABLE users ALTER COLUMN role TYPE text USING role::text;
          -- släng gamla enum
          DROP TYPE userrole;
          -- skapa rätt enum
          CREATE TYPE userrole AS ENUM ('owner','workshop_user','workshop_employee');
          -- normalisera data
          UPDATE users SET role = lower(role);
          -- casta tillbaka till enum
          ALTER TABLE users ALTER COLUMN role TYPE userrole USING role::userrole;
          -- sätt default igen
          ALTER TABLE users ALTER COLUMN role SET DEFAULT 'workshop_user'::userrole;
        END IF;

      ELSE
        -- Typen fanns inte: skapa den och försök casta kolumnen om den finns
        CREATE TYPE userrole AS ENUM ('owner','workshop_user','workshop_employee');
        BEGIN
          ALTER TABLE users ALTER COLUMN role TYPE userrole USING lower(role)::userrole;
        EXCEPTION WHEN undefined_column THEN
          -- users.role finns inte ännu – ignorera
        END;
        ALTER TABLE users ALTER COLUMN role SET DEFAULT 'workshop_user'::userrole;
      END IF;
    END $$;
    """))

with engine.begin() as conn:
    # Baybooking.status
    conn.execute(text("""
        UPDATE baybookings
        SET status = LOWER(status)
        WHERE status IS NOT NULL AND status <> LOWER(status);
    """))

    # WorkshopServiceItem
    conn.execute(text("""
        UPDATE workshop_service_items
        SET price_type = LOWER(price_type)
        WHERE price_type IS NOT NULL AND price_type <> LOWER(price_type);
    """))
    conn.execute(text("""
        UPDATE workshop_service_items
        SET vehicle_class = LOWER(vehicle_class)
        WHERE vehicle_class IS NOT NULL AND vehicle_class <> LOWER(vehicle_class);
    """))

    # WorkshopBay
    conn.execute(text("""
        UPDATE workshopbays
        SET bay_type = LOWER(bay_type)
        WHERE bay_type IS NOT NULL AND bay_type <> LOWER(bay_type);
    """))

    # Vehicle classes i relaterade tabeller
    conn.execute(text("""
        UPDATE workshopbay_vehicleclass
        SET vehicle_class = LOWER(vehicle_class)
        WHERE vehicle_class IS NOT NULL AND vehicle_class <> LOWER(vehicle_class);
    """))
    conn.execute(text("""
        UPDATE vehicleprofiles
        SET vehicle_class = LOWER(vehicle_class)
        WHERE vehicle_class IS NOT NULL AND vehicle_class <> LOWER(vehicle_class);
    """))


print("Färdig.")
