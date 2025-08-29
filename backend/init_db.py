# init_db.py
from sqlalchemy import text, inspect
from app.database import engine
from app.models import Base

print("Skapar tabeller (endast nya)...")
Base.metadata.create_all(bind=engine)

# --- workshops.autonexo (oförändrat) ---
insp = inspect(engine)
cols = [c["name"] for c in insp.get_columns("workshops")]
if "autonexo" not in cols:
    print("Lägger till kolumn 'autonexo' i 'workshops'...")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE workshops ADD COLUMN autonexo boolean NOT NULL DEFAULT true;"))
        conn.execute(text("ALTER TABLE workshops ALTER COLUMN autonexo DROP DEFAULT;"))

# --- userrole ENUM-normalisering (oförändrat) ---
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

        -- Gamla varianten med VERSALER? Migrera till gemener.
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

# --- NYTT: customers.workshop_id (skapa/backfilla/index/FK/unique) ---
print("Säkerställer customers.workshop_id + relationer...")
with engine.begin() as conn:
    # 1) Lägg till kolumnen om saknas (nullable först)
    conn.execute(text("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='customers' AND column_name='workshop_id'
      ) THEN
        ALTER TABLE customers ADD COLUMN workshop_id integer NULL;
      END IF;
    END$$;
    """))

    # 2) Backfilla från baybookings (försök gissa verkstad per kund)
    #    Använder minsta workshop_id för varje kund som synts i bokningar.
    conn.execute(text("""
    WITH guess AS (
      SELECT customer_id, MIN(workshop_id) AS workshop_id
      FROM baybookings
      WHERE customer_id IS NOT NULL AND workshop_id IS NOT NULL
      GROUP BY customer_id
    )
    UPDATE customers c
    SET workshop_id = g.workshop_id
    FROM guess g
    WHERE c.id = g.customer_id AND c.workshop_id IS NULL;
    """))

    # 3) Index på customers.workshop_id om saknas
    conn.execute(text("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind='i' AND c.relname='ix_customer_workshop'
      ) THEN
        CREATE INDEX ix_customer_workshop ON customers (workshop_id);
      END IF;
    END$$;
    """))

    # 4) UQ-constraints (verkstad+email / verkstad+phone) om saknas
    conn.execute(text("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='customers' AND constraint_name='uq_customer_workshop_email'
      ) THEN
        ALTER TABLE customers
          ADD CONSTRAINT uq_customer_workshop_email UNIQUE (workshop_id, email);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='customers' AND constraint_name='uq_customer_workshop_phone'
      ) THEN
        ALTER TABLE customers
          ADD CONSTRAINT uq_customer_workshop_phone UNIQUE (workshop_id, phone);
      END IF;
    END$$;
    """))

    # 5) Uträtta FK om saknas
    conn.execute(text("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name='customers' AND constraint_type='FOREIGN KEY'
          AND constraint_name='fk_customers_workshop'
      ) THEN
        ALTER TABLE customers
          ADD CONSTRAINT fk_customers_workshop
          FOREIGN KEY (workshop_id)
          REFERENCES workshops(id)
          ON DELETE CASCADE;
      END IF;
    END$$;
    """))

    # (Valfritt) Om du längre fram vill göra NOT NULL:
    # Se till att allt är fyllt först, kör sen i separat deploy:
    # ALTER TABLE customers ALTER COLUMN workshop_id SET NOT NULL;

# --- Övriga normaliseringar (oförändrade) ---
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
