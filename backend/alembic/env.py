# backend/alembic/env.py
from logging.config import fileConfig
from alembic import context
from sqlalchemy import engine_from_config, pool
import os
import sys
from pathlib import Path

# --- paths ---
# .../backend/alembic/env.py -> parents[1] = .../backend
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.append(str(BACKEND_DIR))

# --- load .env (om du har en i backend/) ---
try:
    from dotenv import load_dotenv
    load_dotenv(BACKEND_DIR / ".env")
except Exception:
    pass

# Alembic config
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# === Importera din Base ===
# DINA MODELLER LIGGER I backend/app/models.py
from app.models import Base

target_metadata = Base.metadata

# === DB-URL ===
# Prioritera env-variabel (t.ex. från .env), annars alembic.ini
db_url = os.getenv("DATABASE_URL")
if db_url:
    # var explicit med driver för Postgres
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    config.set_main_option("sqlalchemy.url", db_url)
    print("ALEMBIC DB URL:", config.get_main_option("sqlalchemy.url"))

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
