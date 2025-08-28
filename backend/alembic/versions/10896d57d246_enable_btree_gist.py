"""enable btree_gist

Revision ID: 10896d57d246
Revises: f43bde41daeb
Create Date: 2025-08-15 09:17:57.564041
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '10896d57d246'
down_revision: Union[str, Sequence[str], None] = 'f43bde41daeb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Kräver superuser/ADMIN OPTION i Postgres
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist;")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS btree_gist;")
