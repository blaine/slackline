import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, 'schema.sql');

export function initializeDatabase(dbPath = process.env.DATABASE_PATH || './data/slackline.db') {
  const db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Read and execute schema
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Run migrations
  runMigrations(db);

  return db;
}

function runMigrations(db) {
  // Check if total_checkins column exists in streaks table
  const tableInfo = db.prepare("PRAGMA table_info(streaks)").all();
  const hasTotalCheckins = tableInfo.some(col => col.name === 'total_checkins');

  if (!hasTotalCheckins) {
    console.log('📦 Running migration: Adding total_checkins column to streaks table');
    db.exec(`
      ALTER TABLE streaks ADD COLUMN total_checkins INTEGER NOT NULL DEFAULT 0;
      UPDATE streaks SET total_checkins = current_streak WHERE total_checkins = 0;
    `);
    console.log('✅ Migration complete');
  }
}

export function getDatabase() {
  if (!global.__db) {
    global.__db = initializeDatabase();
  }
  return global.__db;
}
