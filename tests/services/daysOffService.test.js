import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeDatabase } from '../../src/database/db.js';
import {
  getUserDaysOff,
  addRecurringDayOff,
  addDateRangeDayOff,
  removeDayOff,
  setWeekendDaysOff
} from '../../src/services/daysOffService.js';
import { unlinkSync, existsSync } from 'fs';

const TEST_DB_PATH = './test-daysoff.db';

describe('Days Off Service', () => {
  let db;
  let testUserId;

  beforeEach(() => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = initializeDatabase(TEST_DB_PATH);
    global.__db = db;

    // Create test user
    const result = db.prepare(`
      INSERT INTO users (slack_user_id, slack_timezone) VALUES (?, ?)
    `).run('U123', 'America/New_York');
    testUserId = result.lastInsertRowid;
  });

  afterEach(() => {
    db.close();
    global.__db = null;
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  it('should add recurring day off', () => {
    const id = addRecurringDayOff(testUserId, 6); // Saturday
    expect(id).toBeGreaterThan(0);

    const daysOff = getUserDaysOff(testUserId);
    expect(daysOff).toHaveLength(1);
    expect(daysOff[0].day_type).toBe('recurring_weekly');
    expect(daysOff[0].day_value).toBe(6);
  });

  it('should not duplicate recurring days off', () => {
    addRecurringDayOff(testUserId, 6);
    addRecurringDayOff(testUserId, 6);

    const daysOff = getUserDaysOff(testUserId);
    expect(daysOff).toHaveLength(1);
  });

  it('should add date range day off', () => {
    const id = addDateRangeDayOff(testUserId, '2024-12-20', '2024-12-31');
    expect(id).toBeGreaterThan(0);

    const daysOff = getUserDaysOff(testUserId);
    expect(daysOff).toHaveLength(1);
    expect(daysOff[0].day_type).toBe('date_range');
    expect(daysOff[0].start_date).toBe('2024-12-20');
    expect(daysOff[0].end_date).toBe('2024-12-31');
  });

  it('should set weekend days off', () => {
    setWeekendDaysOff(testUserId, true);

    const daysOff = getUserDaysOff(testUserId);
    expect(daysOff).toHaveLength(2);

    const dayValues = daysOff.map(d => d.day_value).sort();
    expect(dayValues).toEqual([0, 6]); // Sunday and Saturday
  });

  it('should remove day off', () => {
    const id = addRecurringDayOff(testUserId, 6);
    const removed = removeDayOff(testUserId, id);

    expect(removed).toBe(true);
    expect(getUserDaysOff(testUserId)).toHaveLength(0);
  });
});
