import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeDatabase } from '../../src/database/db.js';
import { unlinkSync, existsSync } from 'fs';

const TEST_DB_PATH = './test-slackline.db';

describe('Database Initialization', () => {
  let db;

  beforeEach(() => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = initializeDatabase(TEST_DB_PATH);
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  it('should create all required tables', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    `).all();

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('channels');
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('streaks');
    expect(tableNames).toContain('days_off');
  });

  it('should create indexes', () => {
    const indexes = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'
    `).all();

    expect(indexes.length).toBeGreaterThan(0);
  });

  it('should enforce foreign keys', () => {
    const fkStatus = db.pragma('foreign_keys', { simple: true });
    expect(fkStatus).toBe(1);
  });
});
