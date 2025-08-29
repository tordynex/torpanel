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
          ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
          ALTER TABLE users ALTER COLUMN role TYPE text USING role::text;
          DROP TYPE userrole;
          CREATE TYPE userrole AS ENUM ('owner','workshop_user','workshop_employee');
          UPDATE users SET role = lower(role);
          ALTER TABLE users ALTER COLUMN role TYPE userrole USING role::userrole;
          ALTER TABLE users ALTER COLUMN role SET DEFAULT 'workshop_user'::userrole;
        END IF;

      ELSE
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

# --- customers.workshop_id (från tidigare svar) ---
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

    # 2) Backfilla från baybookings
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

    # 3) Index
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

    # 4) Unika constraints
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

    # 5) FK
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

# --- NYTT: servicetasks – lägg till nya kolumner + index + FK ---
print("Säkerställer nya kolumner i servicetasks...")
with engine.begin() as conn:
    # Katalog-kolumn
    conn.execute(text("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='servicetasks' AND column_name='catalog_item_id'
      ) THEN
        ALTER TABLE servicetasks ADD COLUMN catalog_item_id integer NULL;
      END IF;
    END$$;
    """))

    # Hours, quantity
    conn.execute(text("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='servicetasks' AND column_name='hours'
      ) THEN
        ALTER TABLE servicetasks ADD COLUMN hours double precision NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='servicetasks' AND column_name='quantity'
      ) THEN
        ALTER TABLE servicetasks ADD COLUMN quantity double precision NULL;
      END IF;
    END$$;
    """))

    # unit_price_ore, line_total_ore
    conn.execute(text("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='servicetasks' AND column_name='unit_price_ore'
      ) THEN
        ALTER TABLE servicetasks ADD COLUMN unit_price_ore integer NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='servicetasks' AND column_name='line_total_ore'
      ) THEN
        ALTER TABLE servicetasks ADD COLUMN line_total_ore integer NULL;
      END IF;
    END$$;
    """))

    # Index på catalog_item_id
    conn.execute(text("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind='i' AND c.relname='ix_servicetasks_catalog_item'
      ) THEN
        CREATE INDEX ix_servicetasks_catalog_item ON servicetasks (catalog_item_id);
      END IF;
    END$$;
    """))

    # FK -> workshop_service_items(id)
    conn.execute(text("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name='servicetasks'
          AND constraint_type='FOREIGN KEY'
          AND constraint_name='fk_servicetasks_catalog_item'
      ) THEN
        ALTER TABLE servicetasks
          ADD CONSTRAINT fk_servicetasks_catalog_item
          FOREIGN KEY (catalog_item_id)
          REFERENCES workshop_service_items(id)
          ON DELETE SET NULL;
      END IF;
    END$$;
    """))

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
