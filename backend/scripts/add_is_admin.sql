-- Run this once against the live database to add is_admin support.
-- Required because SQLAlchemy's create_all does not alter existing tables.
ALTER TABLE players ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE players SET is_admin = TRUE WHERE canonical_name = 'Nikhil P';
