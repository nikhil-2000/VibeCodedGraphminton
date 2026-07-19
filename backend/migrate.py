"""
One-time migration: add seasons, player_season_roles, season_id on games, drop is_sub from players.
Idempotent — safe to re-run.
"""
import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://graphminton:graphminton@localhost:5432/graphminton")
engine = create_engine(DATABASE_URL)

SEED_SEASON_NAME = "2024-2025"
SEED_SEASON_START = "2024-04-08"


def run():
    with engine.begin() as conn:
        # 1. Create seasons table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS seasons (
                id SERIAL PRIMARY KEY,
                name VARCHAR UNIQUE NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE
            )
        """))

        # 2. Create player_season_roles table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS player_season_roles (
                id SERIAL PRIMARY KEY,
                player_id INTEGER NOT NULL REFERENCES players(id),
                season_id INTEGER NOT NULL REFERENCES seasons(id),
                is_sub BOOLEAN NOT NULL DEFAULT FALSE,
                CONSTRAINT uq_player_season UNIQUE (player_id, season_id)
            )
        """))

        # 3. Add season_id to games (nullable first for backfill)
        conn.execute(text("""
            ALTER TABLE games
            ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES seasons(id)
        """))

        # 4. Seed the 2024-2025 season if not present
        conn.execute(text("""
            INSERT INTO seasons (name, start_date, end_date)
            VALUES (:name, :start_date, NULL)
            ON CONFLICT (name) DO NOTHING
        """), {"name": SEED_SEASON_NAME, "start_date": SEED_SEASON_START})

        season_id = conn.execute(
            text("SELECT id FROM seasons WHERE name = :name"),
            {"name": SEED_SEASON_NAME}
        ).scalar()

        # 5. Backfill all games to the seed season
        conn.execute(text("""
            UPDATE games SET season_id = :season_id WHERE season_id IS NULL
        """), {"season_id": season_id})

        # 6. Make season_id NOT NULL now that all rows are backfilled
        conn.execute(text("""
            ALTER TABLE games ALTER COLUMN season_id SET NOT NULL
        """))

        # 7. Seed player_season_roles from current is_sub values
        has_is_sub = conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'players' AND column_name = 'is_sub'
        """)).fetchone()

        if has_is_sub:
            conn.execute(text("""
                INSERT INTO player_season_roles (player_id, season_id, is_sub)
                SELECT id, :season_id, is_sub FROM players
                ON CONFLICT (player_id, season_id) DO NOTHING
            """), {"season_id": season_id})

            # 8. Drop is_sub from players
            conn.execute(text("ALTER TABLE players DROP COLUMN IF EXISTS is_sub"))

    print("Migration complete.")


if __name__ == "__main__":
    run()
