# alembic/env.py
from __future__ import annotations

import os
import sys
from pathlib import Path
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# -----------------------------------------------------------------------------
# Hitta projektroten så att "import app.models" fungerar oavsett varifrån
# Alembic körs (t.ex. backend/ som root).
# -----------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parents[1]  # .../backend
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# -----------------------------------------------------------------------------
# Försök ladda .env (frivilligt – funkar även utan)
# -----------------------------------------------------------------------------
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv(BASE_DIR / ".env")
except Exception:
    pass  # helt ok om python-dotenv inte finns

# -----------------------------------------------------------------------------
# Alembic config + logging
# -----------------------------------------------------------------------------
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# -----------------------------------------------------------------------------
# SQLAlchemy URL från env (tar över alembic.ini)
# -----------------------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    config.set_main_option("sqlalchemy.url", DATABASE_URL)

# -----------------------------------------------------------------------------
# Importera dina modeller (Base) så autogenerate ser all metadata
# OBS: Se till att app/models.py importerar alla tabellklasser.
# -----------------------------------------------------------------------------
from app.models import Base  # noqa: E402

target_metadata = Base.metadata

# -----------------------------------------------------------------------------
# (Valfritt) Om du vill lagra alembic_version i annat schema, ändra här.
# För standard Postgres "public" låter vi vara None.
# -----------------------------------------------------------------------------
VERSION_TABLE_SCHEMA = None  # ex: "public"

# -----------------------------------------------------------------------------
# Inkludera/uteslut objekt vid autogenerate (behåll default: ta med allt)
# -----------------------------------------------------------------------------
def include_object(obj, name, type_, reflected, compare_to):
    # Exempel: hoppa över views om du skulle ha sådana
    # if type_ == "table" and getattr(obj, "info", {}).get("skip_autogenerate"):
    #     return False
    return True

# -----------------------------------------------------------------------------
# Offline migrations (genererar SQL utan DB-anslutning)
# -----------------------------------------------------------------------------
def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    if not url:
        raise RuntimeError(
            "Saknar sqlalchemy.url – sätt DATABASE_URL i .env eller miljövariabel."
        )

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
        version_table_schema=VERSION_TABLE_SCHEMA,
        # Postgres: ingen batch-render behövs (detta är mest för SQLite)
        render_as_batch=False,
    )

    with context.begin_transaction():
        context.run_migrations()

# -----------------------------------------------------------------------------
# Online migrations (kör mot levande DB)
# -----------------------------------------------------------------------------
def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            include_object=include_object,
            version_table_schema=VERSION_TABLE_SCHEMA,
            render_as_batch=False,
        )

        with context.begin_transaction():
            context.run_migrations()

# -----------------------------------------------------------------------------
# Entrypoint
# -----------------------------------------------------------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
