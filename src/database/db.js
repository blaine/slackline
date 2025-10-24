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

  return db;
}

export function getDatabase() {
  if (!global.__db) {
    global.__db = initializeDatabase();
  }
  return global.__db;
}
