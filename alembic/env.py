import sys
import os

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from pathlib import Path

from dotenv import load_dotenv

# 👉 Lägg till backend/ i sys.path
BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(BACKEND_DIR))

# 👉 1. Hämta Alembic config-objektet först
config = context.config

# 👉 2. Ladda .env-filen
env_path = Path(__file__).resolve().parent.parent / "backend" / ".env"
load_dotenv(dotenv_path=env_path)

# 👉 3. Injecta DATABASE_URL från .env till alembic
config.set_main_option("sqlalchemy.url", os.getenv("DATABASE_URL"))

# Set up logging (valfritt men rekommenderat)
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 👉 4. Importera din metadata här (exempel nedan)
from app.models import Base

target_metadata = Base.metadata

# Offline migrations
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

# Online migrations
def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()

# Run the correct one
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
