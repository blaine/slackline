-- Migration: Add total_checkins column if it doesn't exist
-- SQLite doesn't support "ADD COLUMN IF NOT EXISTS", so we need to check first

-- For streaks table: Add total_checkins if missing
-- This is safe to run multiple times due to CREATE TABLE IF NOT EXISTS pattern in schema.sql
-- We'll handle this in the migration code instead
