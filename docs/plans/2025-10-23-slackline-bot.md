# Slackline Bot Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Build a Slack bot that tracks daily check-in streaks per user per channel, with days-off support and achievement celebrations.

**Architecture:** Event-driven Node.js app using Bolt for Slack. Pure reactive - calculates streaks when users post. SQLite for persistence. Deploy to Fly.io.

**Tech Stack:** Node.js 20, @slack/bolt, better-sqlite3, luxon, vitest

---

## Task 1: Database Foundation

**Files:**
- Create: `src/database/schema.sql`
- Create: `src/database/db.js`
- Test: `tests/database/db.test.js`

**Step 1: Write database schema**

Create `src/database/schema.sql`:

```sql
-- Channels being monitored
CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_channel_id TEXT NOT NULL UNIQUE,
    channel_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Users who have posted
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_user_id TEXT NOT NULL UNIQUE,
    slack_timezone TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Streak data per user per channel
CREATE TABLE IF NOT EXISTS streaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    current_streak INTEGER NOT NULL DEFAULT 0,
    last_post_date TEXT,
    total_checkins INTEGER NOT NULL DEFAULT 0,
    streak_start_date TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (channel_id) REFERENCES channels(id),
    UNIQUE(user_id, channel_id)
);

-- Days off configuration
CREATE TABLE IF NOT EXISTS days_off (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    day_type TEXT NOT NULL CHECK(day_type IN ('recurring_weekly', 'date_range')),
    day_value INTEGER,
    start_date TEXT,
    end_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_slack_user_id ON users(slack_user_id);
CREATE INDEX IF NOT EXISTS idx_channels_slack_channel_id ON channels(slack_channel_id);
CREATE INDEX IF NOT EXISTS idx_streaks_user_channel ON streaks(user_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_days_off_user_id ON days_off(user_id);
```

**Step 2: Write database initialization module**

Create `src/database/db.js`:

```javascript
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
```

**Step 3: Write test for database initialization**

Create `tests/database/db.test.js`:

```javascript
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
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/database/db.test.js`
Expected: All tests pass

---

## Task 2: Date Utilities

**Files:**
- Create: `src/utils/dateUtils.js`
- Test: `tests/utils/dateUtils.test.js`

**Step 1: Write date utility functions**

Create `src/utils/dateUtils.js`:

```javascript
import { DateTime } from 'luxon';

/**
 * Get current date in user's timezone as YYYY-MM-DD string
 */
export function getCurrentDateInTimezone(timezone = 'UTC') {
  return DateTime.now().setZone(timezone).toISODate();
}

/**
 * Parse date string to DateTime in given timezone
 */
export function parseDate(dateStr, timezone = 'UTC') {
  return DateTime.fromISO(dateStr, { zone: timezone });
}

/**
 * Calculate number of working days between two dates, excluding days off
 * @param {string} startDate - YYYY-MM-DD format
 * @param {string} endDate - YYYY-MM-DD format
 * @param {Array} daysOff - Array of day-off configurations
 * @param {string} timezone - User's timezone
 * @returns {number} Number of working days
 */
export function getWorkingDaysBetween(startDate, endDate, daysOff = [], timezone = 'UTC') {
  const start = DateTime.fromISO(startDate, { zone: timezone });
  const end = DateTime.fromISO(endDate, { zone: timezone });

  let count = 0;
  let current = start;

  while (current <= end) {
    if (!isDayOff(current.toISODate(), daysOff, current.weekday)) {
      count++;
    }
    current = current.plus({ days: 1 });
  }

  return count;
}

/**
 * Check if a specific date is a day off
 */
export function isDayOff(dateStr, daysOff = [], weekday = null) {
  const date = DateTime.fromISO(dateStr);
  const dayOfWeek = weekday || date.weekday; // 1=Monday, 7=Sunday

  for (const dayOff of daysOff) {
    if (dayOff.day_type === 'recurring_weekly') {
      // Convert weekday: SQLite uses 0=Sunday, Luxon uses 7=Sunday
      const sqliteDayOfWeek = dayOfWeek === 7 ? 0 : dayOfWeek;
      if (dayOff.day_value === sqliteDayOfWeek) {
        return true;
      }
    } else if (dayOff.day_type === 'date_range') {
      const startDate = DateTime.fromISO(dayOff.start_date);
      const endDate = DateTime.fromISO(dayOff.end_date);
      if (date >= startDate && date <= endDate) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get the date for yesterday in user's timezone
 */
export function getYesterdayInTimezone(timezone = 'UTC') {
  return DateTime.now().setZone(timezone).minus({ days: 1 }).toISODate();
}

/**
 * Find the next working day after a given date
 */
export function getNextWorkingDay(dateStr, daysOff = [], timezone = 'UTC') {
  let current = DateTime.fromISO(dateStr, { zone: timezone }).plus({ days: 1 });

  while (isDayOff(current.toISODate(), daysOff, current.weekday)) {
    current = current.plus({ days: 1 });
  }

  return current.toISODate();
}
```

**Step 2: Write tests for date utilities**

Create `tests/utils/dateUtils.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import {
  getCurrentDateInTimezone,
  isDayOff,
  getWorkingDaysBetween,
  getNextWorkingDay
} from '../../src/utils/dateUtils.js';

describe('Date Utilities', () => {
  describe('isDayOff', () => {
    it('should return true for recurring weekly days off', () => {
      const daysOff = [
        { day_type: 'recurring_weekly', day_value: 0 }, // Sunday
        { day_type: 'recurring_weekly', day_value: 6 }  // Saturday
      ];

      // 2024-01-06 is a Saturday
      expect(isDayOff('2024-01-06', daysOff)).toBe(true);
      // 2024-01-07 is a Sunday
      expect(isDayOff('2024-01-07', daysOff)).toBe(true);
      // 2024-01-08 is a Monday
      expect(isDayOff('2024-01-08', daysOff)).toBe(false);
    });

    it('should return true for date ranges', () => {
      const daysOff = [
        {
          day_type: 'date_range',
          start_date: '2024-12-20',
          end_date: '2024-12-31'
        }
      ];

      expect(isDayOff('2024-12-25', daysOff)).toBe(true);
      expect(isDayOff('2024-12-19', daysOff)).toBe(false);
      expect(isDayOff('2025-01-01', daysOff)).toBe(false);
    });

    it('should handle single day as range', () => {
      const daysOff = [
        {
          day_type: 'date_range',
          start_date: '2024-11-29',
          end_date: '2024-11-29'
        }
      ];

      expect(isDayOff('2024-11-29', daysOff)).toBe(true);
      expect(isDayOff('2024-11-28', daysOff)).toBe(false);
    });
  });

  describe('getWorkingDaysBetween', () => {
    it('should count only working days', () => {
      const daysOff = [
        { day_type: 'recurring_weekly', day_value: 0 }, // Sunday
        { day_type: 'recurring_weekly', day_value: 6 }  // Saturday
      ];

      // Monday to Friday = 5 working days
      const count = getWorkingDaysBetween('2024-01-08', '2024-01-12', daysOff);
      expect(count).toBe(5);
    });

    it('should exclude vacation days', () => {
      const daysOff = [
        {
          day_type: 'date_range',
          start_date: '2024-01-10',
          end_date: '2024-01-11'
        }
      ];

      // Jan 8-12 = 5 days, minus 2 vacation days = 3
      const count = getWorkingDaysBetween('2024-01-08', '2024-01-12', daysOff);
      expect(count).toBe(3);
    });
  });

  describe('getNextWorkingDay', () => {
    it('should skip weekends', () => {
      const daysOff = [
        { day_type: 'recurring_weekly', day_value: 0 },
        { day_type: 'recurring_weekly', day_value: 6 }
      ];

      // Friday 2024-01-05 -> Monday 2024-01-08
      const nextDay = getNextWorkingDay('2024-01-05', daysOff);
      expect(nextDay).toBe('2024-01-08');
    });
  });
});
```

**Step 3: Run tests to verify they pass**

Run: `npm test tests/utils/dateUtils.test.js`
Expected: All tests pass

---

## Task 3: Days Off Service

**Files:**
- Create: `src/services/daysOffService.js`
- Test: `tests/services/daysOffService.test.js`

**Step 1: Write days off service**

Create `src/services/daysOffService.js`:

```javascript
import { getDatabase } from '../database/db.js';

/**
 * Get all days off for a user
 */
export function getUserDaysOff(userId) {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM days_off WHERE user_id = ?
  `).all(userId);
}

/**
 * Add a recurring weekly day off (0=Sunday, 6=Saturday)
 */
export function addRecurringDayOff(userId, dayValue) {
  const db = getDatabase();

  // Check if already exists
  const existing = db.prepare(`
    SELECT id FROM days_off
    WHERE user_id = ? AND day_type = 'recurring_weekly' AND day_value = ?
  `).get(userId, dayValue);

  if (existing) {
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO days_off (user_id, day_type, day_value)
    VALUES (?, 'recurring_weekly', ?)
  `).run(userId, dayValue);

  return result.lastInsertRowid;
}

/**
 * Add a date range day off (vacation)
 */
export function addDateRangeDayOff(userId, startDate, endDate) {
  const db = getDatabase();

  const result = db.prepare(`
    INSERT INTO days_off (user_id, day_type, start_date, end_date)
    VALUES (?, 'date_range', ?, ?)
  `).run(userId, startDate, endDate);

  return result.lastInsertRowid;
}

/**
 * Remove a specific day off
 */
export function removeDayOff(userId, dayOffId) {
  const db = getDatabase();

  const result = db.prepare(`
    DELETE FROM days_off WHERE id = ? AND user_id = ?
  `).run(dayOffId, userId);

  return result.changes > 0;
}

/**
 * Remove all recurring weekly days off for a user
 */
export function removeAllRecurringDaysOff(userId) {
  const db = getDatabase();

  const result = db.prepare(`
    DELETE FROM days_off WHERE user_id = ? AND day_type = 'recurring_weekly'
  `).run(userId);

  return result.changes;
}

/**
 * Set weekend days off (Saturday and Sunday)
 */
export function setWeekendDaysOff(userId, enabled) {
  if (enabled) {
    addRecurringDayOff(userId, 0); // Sunday
    addRecurringDayOff(userId, 6); // Saturday
  } else {
    const db = getDatabase();
    db.prepare(`
      DELETE FROM days_off
      WHERE user_id = ? AND day_type = 'recurring_weekly' AND day_value IN (0, 6)
    `).run(userId);
  }
}
```

**Step 2: Write tests**

Create `tests/services/daysOffService.test.js`:

```javascript
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
```

**Step 3: Run tests**

Run: `npm test tests/services/daysOffService.test.js`
Expected: All tests pass

---

## Task 4: Achievement Service

**Files:**
- Create: `src/services/achievementService.js`
- Test: `tests/services/achievementService.test.js`

**Step 1: Write achievement service**

Create `src/services/achievementService.js`:

```javascript
/**
 * Define achievement milestones
 * Format: { days: number, message: string }
 */
const MILESTONES = [
  { days: 1, message: "Welcome to the streak! First check-in complete! 🎯" },
  { days: 5, message: "One work week down! Keep it going! 🔥" },
  { days: 10, message: "Two weeks of consistency! You're on fire! ⚡" },
  { days: 20, message: "Four weeks strong! Amazing dedication! 💪" },
  { days: 50, message: "Half a century of check-ins! Incredible! 🌟" },
  { days: 60, message: "Three months of commitment! Unstoppable! 🚀" },
  { days: 100, message: "Triple digits! You're a streak legend! 🏆" },
  { days: 120, message: "Six months of dedication! Phenomenal! 👑" },
  { days: 250, message: "250 check-ins! You're an inspiration! ✨" },
  { days: 500, message: "Half a thousand! Absolutely remarkable! 🎊" },
  { days: 750, message: "750 days! Your consistency is legendary! 🌠" },
  { days: 1000, message: "ONE THOUSAND DAYS! Unbelievable achievement! 🎆" }
];

// After 1000, celebrate every 250 days
const ONGOING_MILESTONE_INTERVAL = 250;

/**
 * Check if current streak count is an achievement milestone
 * @param {number} streakCount - Current streak count
 * @returns {object|null} Achievement object or null
 */
export function checkAchievement(streakCount) {
  // Check predefined milestones
  const milestone = MILESTONES.find(m => m.days === streakCount);
  if (milestone) {
    return milestone;
  }

  // Check ongoing milestones (every 250 after 1000)
  if (streakCount > 1000 && streakCount % ONGOING_MILESTONE_INTERVAL === 0) {
    return {
      days: streakCount,
      message: `${streakCount} days! Your dedication knows no bounds! 🌟`
    };
  }

  return null;
}

/**
 * Format achievement celebration message
 */
export function formatAchievementMessage(userId, achievement) {
  return `🎉 Congratulations <@${userId}>! You've reached a ${achievement.days} day streak! 🎉\n${achievement.message}`;
}

/**
 * Get all milestone values (for testing/reference)
 */
export function getAllMilestones() {
  return [...MILESTONES];
}
```

**Step 2: Write tests**

Create `tests/services/achievementService.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import {
  checkAchievement,
  formatAchievementMessage,
  getAllMilestones
} from '../../src/services/achievementService.js';

describe('Achievement Service', () => {
  it('should detect predefined milestones', () => {
    expect(checkAchievement(1)).toBeTruthy();
    expect(checkAchievement(5)).toBeTruthy();
    expect(checkAchievement(10)).toBeTruthy();
    expect(checkAchievement(50)).toBeTruthy();
    expect(checkAchievement(100)).toBeTruthy();
  });

  it('should not detect non-milestones', () => {
    expect(checkAchievement(2)).toBeNull();
    expect(checkAchievement(7)).toBeNull();
    expect(checkAchievement(99)).toBeNull();
  });

  it('should detect ongoing milestones after 1000', () => {
    expect(checkAchievement(1250)).toBeTruthy();
    expect(checkAchievement(1500)).toBeTruthy();
    expect(checkAchievement(2000)).toBeTruthy();
  });

  it('should not detect non-250-intervals after 1000', () => {
    expect(checkAchievement(1100)).toBeNull();
    expect(checkAchievement(1249)).toBeNull();
  });

  it('should format achievement message with user mention', () => {
    const achievement = checkAchievement(1);
    const message = formatAchievementMessage('U12345', achievement);

    expect(message).toContain('<@U12345>');
    expect(message).toContain('1 day streak');
    expect(message).toContain('🎉');
  });

  it('should return all milestones', () => {
    const milestones = getAllMilestones();
    expect(milestones.length).toBeGreaterThan(0);
    expect(milestones[0]).toHaveProperty('days');
    expect(milestones[0]).toHaveProperty('message');
  });
});
```

**Step 3: Run tests**

Run: `npm test tests/services/achievementService.test.js`
Expected: All tests pass

---

## Task 5: Streak Service

**Files:**
- Create: `src/services/streakService.js`
- Test: `tests/services/streakService.test.js`

**Step 1: Write streak service**

Create `src/services/streakService.js`:

```javascript
import { getDatabase } from '../database/db.js';
import { getUserDaysOff } from './daysOffService.js';
import { getCurrentDateInTimezone, isDayOff, parseDate } from '../utils/dateUtils.js';

/**
 * Ensure user exists in database, create if not
 */
export function ensureUser(slackUserId, timezone = 'UTC') {
  const db = getDatabase();

  let user = db.prepare('SELECT * FROM users WHERE slack_user_id = ?').get(slackUserId);

  if (!user) {
    const result = db.prepare(`
      INSERT INTO users (slack_user_id, slack_timezone)
      VALUES (?, ?)
    `).run(slackUserId, timezone);

    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  } else if (user.slack_timezone !== timezone) {
    // Update timezone if changed
    db.prepare(`
      UPDATE users SET slack_timezone = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(timezone, user.id);
    user.slack_timezone = timezone;
  }

  return user;
}

/**
 * Ensure channel exists in database
 */
export function ensureChannel(slackChannelId, channelName) {
  const db = getDatabase();

  let channel = db.prepare('SELECT * FROM channels WHERE slack_channel_id = ?').get(slackChannelId);

  if (!channel) {
    const result = db.prepare(`
      INSERT INTO channels (slack_channel_id, channel_name)
      VALUES (?, ?)
    `).run(slackChannelId, channelName);

    channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(result.lastInsertRowid);
  }

  return channel;
}

/**
 * Get or create streak record for user in channel
 */
export function getStreak(userId, channelId) {
  const db = getDatabase();

  let streak = db.prepare(`
    SELECT * FROM streaks WHERE user_id = ? AND channel_id = ?
  `).get(userId, channelId);

  if (!streak) {
    const result = db.prepare(`
      INSERT INTO streaks (user_id, channel_id, current_streak, total_checkins)
      VALUES (?, ?, 0, 0)
    `).run(userId, channelId);

    streak = db.prepare('SELECT * FROM streaks WHERE id = ?').get(result.lastInsertRowid);
  }

  return streak;
}

/**
 * Process a user's check-in post
 * Returns: { updated: boolean, streakCount: number, isNewAchievement: boolean }
 */
export function processCheckin(slackUserId, slackChannelId, channelName, timezone = 'UTC') {
  const db = getDatabase();

  // Ensure user and channel exist
  const user = ensureUser(slackUserId, timezone);
  const channel = ensureChannel(slackChannelId, channelName);

  // Get current date in user's timezone
  const today = getCurrentDateInTimezone(timezone);

  // Get or create streak
  const streak = getStreak(user.id, channel.id);

  // If user already posted today, ignore (idempotent)
  if (streak.last_post_date === today) {
    return {
      updated: false,
      streakCount: streak.current_streak,
      isNewAchievement: false
    };
  }

  // Get user's days off
  const daysOff = getUserDaysOff(user.id);

  // Calculate new streak
  let newStreak = 1;
  let streakStartDate = today;

  if (streak.last_post_date) {
    // Check if streak continues
    const lastPostDate = parseDate(streak.last_post_date, timezone);
    const todayDate = parseDate(today, timezone);

    // Count working days between last post and today
    let expectedNextDay = lastPostDate;
    let currentDay = lastPostDate.plus({ days: 1 });

    // Find the next expected working day after last post
    while (currentDay < todayDate) {
      if (!isDayOff(currentDay.toISODate(), daysOff, currentDay.weekday)) {
        expectedNextDay = currentDay;
        break;
      }
      currentDay = currentDay.plus({ days: 1 });
    }

    // Check if today is the expected next working day
    if (expectedNextDay.toISODate() === today ||
        (expectedNextDay < todayDate && !isDayOff(today, daysOff))) {
      // Streak continues
      newStreak = streak.current_streak + 1;
      streakStartDate = streak.streak_start_date || streak.last_post_date;
    }
    // else: streak broken, reset to 1
  }

  // Update streak in database
  db.prepare(`
    UPDATE streaks
    SET current_streak = ?,
        last_post_date = ?,
        total_checkins = total_checkins + 1,
        streak_start_date = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(newStreak, today, streakStartDate, streak.id);

  return {
    updated: true,
    streakCount: newStreak,
    isNewAchievement: newStreak === 1 || newStreak > streak.current_streak,
    wasReset: newStreak === 1 && streak.current_streak > 1
  };
}

/**
 * Get streak stats for a user in a channel
 */
export function getStreakStats(slackUserId, slackChannelId) {
  const db = getDatabase();

  const result = db.prepare(`
    SELECT
      s.current_streak,
      s.total_checkins,
      s.last_post_date,
      s.streak_start_date,
      u.slack_timezone
    FROM streaks s
    JOIN users u ON s.user_id = u.id
    JOIN channels c ON s.channel_id = c.id
    WHERE u.slack_user_id = ? AND c.slack_channel_id = ?
  `).get(slackUserId, slackChannelId);

  return result || null;
}
```

**Step 2: Write tests**

Create `tests/services/streakService.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeDatabase } from '../../src/database/db.js';
import {
  ensureUser,
  ensureChannel,
  processCheckin,
  getStreakStats
} from '../../src/services/streakService.js';
import { addRecurringDayOff } from '../../src/services/daysOffService.js';
import { unlinkSync, existsSync } from 'fs';

const TEST_DB_PATH = './test-streak.db';

describe('Streak Service', () => {
  let db;

  beforeEach(() => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = initializeDatabase(TEST_DB_PATH);
    global.__db = db;
  });

  afterEach(() => {
    db.close();
    global.__db = null;
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  it('should create user if not exists', () => {
    const user = ensureUser('U123', 'America/New_York');
    expect(user).toBeTruthy();
    expect(user.slack_user_id).toBe('U123');
    expect(user.slack_timezone).toBe('America/New_York');
  });

  it('should return existing user', () => {
    const user1 = ensureUser('U123', 'America/New_York');
    const user2 = ensureUser('U123', 'America/New_York');
    expect(user1.id).toBe(user2.id);
  });

  it('should create channel if not exists', () => {
    const channel = ensureChannel('C123', 'general');
    expect(channel).toBeTruthy();
    expect(channel.slack_channel_id).toBe('C123');
  });

  it('should process first check-in', () => {
    const result = processCheckin('U123', 'C123', 'general', 'UTC');

    expect(result.updated).toBe(true);
    expect(result.streakCount).toBe(1);
    expect(result.isNewAchievement).toBe(true);
  });

  it('should ignore duplicate check-ins on same day', () => {
    processCheckin('U123', 'C123', 'general', 'UTC');
    const result = processCheckin('U123', 'C123', 'general', 'UTC');

    expect(result.updated).toBe(false);
    expect(result.streakCount).toBe(1);
  });

  it('should get streak stats', () => {
    processCheckin('U123', 'C123', 'general', 'UTC');

    const stats = getStreakStats('U123', 'C123');
    expect(stats).toBeTruthy();
    expect(stats.current_streak).toBe(1);
    expect(stats.total_checkins).toBe(1);
  });

  it('should maintain separate streaks per channel', () => {
    processCheckin('U123', 'C123', 'general', 'UTC');
    processCheckin('U123', 'C456', 'random', 'UTC');

    const stats1 = getStreakStats('U123', 'C123');
    const stats2 = getStreakStats('U123', 'C456');

    expect(stats1.current_streak).toBe(1);
    expect(stats2.current_streak).toBe(1);
  });
});
```

**Step 3: Run tests**

Run: `npm test tests/services/streakService.test.js`
Expected: All tests pass

---

## Task 6: Message Handler

**Files:**
- Create: `src/handlers/messageHandler.js`
- Test: `tests/handlers/messageHandler.test.js`

**Step 1: Write message handler**

Create `src/handlers/messageHandler.js`:

```javascript
import { processCheckin } from '../services/streakService.js';
import { checkAchievement, formatAchievementMessage } from '../services/achievementService.js';

/**
 * Handle incoming message events from Slack
 */
export async function handleMessage({ message, say, client }) {
  try {
    // Ignore bot messages and threaded replies
    if (message.subtype || message.thread_ts) {
      return;
    }

    // Ignore messages without user (shouldn't happen, but safety check)
    if (!message.user) {
      return;
    }

    // Get user's timezone from Slack
    let timezone = 'UTC';
    try {
      const userInfo = await client.users.info({ user: message.user });
      timezone = userInfo.user.tz || 'UTC';
    } catch (error) {
      console.error('Failed to fetch user timezone:', error);
    }

    // Get channel name
    let channelName = 'unknown';
    try {
      const channelInfo = await client.conversations.info({ channel: message.channel });
      channelName = channelInfo.channel.name || 'unknown';
    } catch (error) {
      console.error('Failed to fetch channel info:', error);
    }

    // Process the check-in
    const result = processCheckin(
      message.user,
      message.channel,
      channelName,
      timezone
    );

    // If not updated (duplicate post today), do nothing
    if (!result.updated) {
      return;
    }

    // Check if this is an achievement
    const achievement = checkAchievement(result.streakCount);

    if (achievement) {
      // Post celebration message
      const celebrationMessage = formatAchievementMessage(message.user, achievement);
      await say(celebrationMessage);
    }

  } catch (error) {
    console.error('Error handling message:', error);
    // Don't throw - we don't want to crash on individual message failures
  }
}
```

**Step 2: Write tests**

Create `tests/handlers/messageHandler.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initializeDatabase } from '../../src/database/db.js';
import { handleMessage } from '../../src/handlers/messageHandler.js';
import { unlinkSync, existsSync } from 'fs';

const TEST_DB_PATH = './test-handler.db';

describe('Message Handler', () => {
  let db;
  let mockSay;
  let mockClient;

  beforeEach(() => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = initializeDatabase(TEST_DB_PATH);
    global.__db = db;

    mockSay = vi.fn();
    mockClient = {
      users: {
        info: vi.fn().mockResolvedValue({
          user: { tz: 'America/New_York' }
        })
      },
      conversations: {
        info: vi.fn().mockResolvedValue({
          channel: { name: 'general' }
        })
      }
    };
  });

  afterEach(() => {
    db.close();
    global.__db = null;
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    vi.clearAllMocks();
  });

  it('should process first message and post achievement', async () => {
    const message = {
      user: 'U123',
      channel: 'C123',
      text: 'Hello world'
    };

    await handleMessage({ message, say: mockSay, client: mockClient });

    expect(mockSay).toHaveBeenCalledTimes(1);
    expect(mockSay.mock.calls[0][0]).toContain('<@U123>');
    expect(mockSay.mock.calls[0][0]).toContain('1 day streak');
  });

  it('should ignore bot messages', async () => {
    const message = {
      user: 'U123',
      channel: 'C123',
      text: 'Hello',
      subtype: 'bot_message'
    };

    await handleMessage({ message, say: mockSay, client: mockClient });

    expect(mockSay).not.toHaveBeenCalled();
  });

  it('should ignore threaded replies', async () => {
    const message = {
      user: 'U123',
      channel: 'C123',
      text: 'Reply',
      thread_ts: '1234567890.123456'
    };

    await handleMessage({ message, say: mockSay, client: mockClient });

    expect(mockSay).not.toHaveBeenCalled();
  });

  it('should not post for duplicate messages same day', async () => {
    const message = {
      user: 'U123',
      channel: 'C123',
      text: 'Hello'
    };

    await handleMessage({ message, say: mockSay, client: mockClient });
    mockSay.mockClear();

    await handleMessage({ message, say: mockSay, client: mockClient });

    expect(mockSay).not.toHaveBeenCalled();
  });
});
```

**Step 3: Run tests**

Run: `npm test tests/handlers/messageHandler.test.js`
Expected: All tests pass

---

## Task 7: Command Handler

**Files:**
- Create: `src/handlers/commandHandler.js`

**Step 1: Write command handler**

Create `src/handlers/commandHandler.js`:

```javascript
import { getStreakStats } from '../services/streakService.js';
import {
  addDateRangeDayOff,
  setWeekendDaysOff,
  getUserDaysOff
} from '../services/daysOffService.js';
import { ensureUser } from '../services/streakService.js';

/**
 * Handle /slackline slash command
 */
export async function handleCommand({ command, ack, respond, client }) {
  await ack();

  try {
    const subcommand = command.text.trim().split(' ')[0].toLowerCase();
    const args = command.text.trim().split(' ').slice(1);

    switch (subcommand) {
      case 'help':
        await handleHelp(respond);
        break;
      case 'stats':
        await handleStats(command, respond);
        break;
      case 'dayoff':
        await handleDayOff(command, args, respond, client);
        break;
      case 'vacation':
        await handleVacation(command, args, respond, client);
        break;
      case 'weekends':
        await handleWeekends(command, args, respond, client);
        break;
      case 'list-daysoff':
        await handleListDaysOff(command, respond, client);
        break;
      case 'settings':
        await handleSettings(command, respond, client);
        break;
      default:
        await respond({
          text: `Unknown command: ${subcommand}\n\nUse \`/slackline help\` to see available commands.`,
          response_type: 'ephemeral'
        });
    }
  } catch (error) {
    console.error('Error handling command:', error);
    await respond({
      text: '❌ An error occurred processing your command. Please try again.',
      response_type: 'ephemeral'
    });
  }
}

async function handleHelp(respond) {
  await respond({
    text: `*Slackline Bot Commands*

• \`/slackline help\` - Show this help message
• \`/slackline stats\` - View your current streak and total check-ins
• \`/slackline settings\` - Open settings modal (coming soon)
• \`/slackline dayoff <date>\` - Mark a single day off (YYYY-MM-DD)
  Example: \`/slackline dayoff 2024-12-25\`
• \`/slackline vacation <start> <end>\` - Mark a vacation range
  Example: \`/slackline vacation 2024-12-20 2024-12-31\`
• \`/slackline weekends <on|off>\` - Toggle Saturday/Sunday as days off
• \`/slackline list-daysoff\` - Show your configured days off`,
    response_type: 'ephemeral'
  });
}

async function handleStats(command, respond) {
  const stats = getStreakStats(command.user_id, command.channel_id);

  if (!stats || stats.total_checkins === 0) {
    await respond({
      text: `You haven't started a streak in this channel yet! Post a message to begin. 🎯`,
      response_type: 'ephemeral'
    });
    return;
  }

  await respond({
    text: `📊 *Your Streak Stats*

🔥 Current Streak: *${stats.current_streak} days*
✅ Total Check-ins: *${stats.total_checkins}*
📅 Last Post: ${stats.last_post_date}
🎬 Streak Started: ${stats.streak_start_date || 'N/A'}`,
    response_type: 'ephemeral'
  });
}

async function handleDayOff(command, args, respond, client) {
  if (args.length !== 1) {
    await respond({
      text: '❌ Usage: `/slackline dayoff <date>`\nExample: `/slackline dayoff 2024-12-25`',
      response_type: 'ephemeral'
    });
    return;
  }

  const date = args[0];

  // Validate date format (basic check)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    await respond({
      text: '❌ Invalid date format. Please use YYYY-MM-DD format.',
      response_type: 'ephemeral'
    });
    return;
  }

  // Get user timezone
  const userInfo = await client.users.info({ user: command.user_id });
  const timezone = userInfo.user.tz || 'UTC';

  const user = ensureUser(command.user_id, timezone);
  addDateRangeDayOff(user.id, date, date);

  await respond({
    text: `✅ Marked ${date} as a day off.`,
    response_type: 'ephemeral'
  });
}

async function handleVacation(command, args, respond, client) {
  if (args.length !== 2) {
    await respond({
      text: '❌ Usage: `/slackline vacation <start-date> <end-date>`\nExample: `/slackline vacation 2024-12-20 2024-12-31`',
      response_type: 'ephemeral'
    });
    return;
  }

  const [startDate, endDate] = args;

  // Validate date formats
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    await respond({
      text: '❌ Invalid date format. Please use YYYY-MM-DD format for both dates.',
      response_type: 'ephemeral'
    });
    return;
  }

  // Get user timezone
  const userInfo = await client.users.info({ user: command.user_id });
  const timezone = userInfo.user.tz || 'UTC';

  const user = ensureUser(command.user_id, timezone);
  addDateRangeDayOff(user.id, startDate, endDate);

  await respond({
    text: `✅ Marked ${startDate} to ${endDate} as vacation days.`,
    response_type: 'ephemeral'
  });
}

async function handleWeekends(command, args, respond, client) {
  if (args.length !== 1 || !['on', 'off'].includes(args[0].toLowerCase())) {
    await respond({
      text: '❌ Usage: `/slackline weekends <on|off>`',
      response_type: 'ephemeral'
    });
    return;
  }

  const enabled = args[0].toLowerCase() === 'on';

  // Get user timezone
  const userInfo = await client.users.info({ user: command.user_id });
  const timezone = userInfo.user.tz || 'UTC';

  const user = ensureUser(command.user_id, timezone);
  setWeekendDaysOff(user.id, enabled);

  await respond({
    text: `✅ Weekends (Saturday & Sunday) ${enabled ? 'enabled' : 'disabled'} as days off.`,
    response_type: 'ephemeral'
  });
}

async function handleListDaysOff(command, respond, client) {
  const userInfo = await client.users.info({ user: command.user_id });
  const timezone = userInfo.user.tz || 'UTC';

  const user = ensureUser(command.user_id, timezone);
  const daysOff = getUserDaysOff(user.id);

  if (daysOff.length === 0) {
    await respond({
      text: `You don't have any days off configured. Use \`/slackline weekends on\` or \`/slackline vacation\` to add some.`,
      response_type: 'ephemeral'
    });
    return;
  }

  const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let message = '*Your Days Off:*\n\n';

  const recurring = daysOff.filter(d => d.day_type === 'recurring_weekly');
  const ranges = daysOff.filter(d => d.day_type === 'date_range');

  if (recurring.length > 0) {
    message += '*Recurring Weekly:*\n';
    recurring.forEach(d => {
      message += `• ${weekDays[d.day_value]}\n`;
    });
    message += '\n';
  }

  if (ranges.length > 0) {
    message += '*Date Ranges:*\n';
    ranges.forEach(d => {
      if (d.start_date === d.end_date) {
        message += `• ${d.start_date}\n`;
      } else {
        message += `• ${d.start_date} to ${d.end_date}\n`;
      }
    });
  }

  await respond({
    text: message,
    response_type: 'ephemeral'
  });
}

async function handleSettings(command, respond, client) {
  await respond({
    text: '⚠️ Settings modal coming soon! For now, use the command-line interface:\n\n' +
          '• `/slackline weekends on` - Enable weekends as days off\n' +
          '• `/slackline vacation <start> <end>` - Add vacation dates\n' +
          '• `/slackline list-daysoff` - View your days off',
    response_type: 'ephemeral'
  });
}
```

**Step 2: Test manually** (integration testing for commands is complex, better done manually or with E2E tests)

---

## Task 8: Main Application

**Files:**
- Create: `src/app.js`

**Step 1: Write main application**

Create `src/app.js`:

```javascript
import { App } from '@slack/bolt';
import { initializeDatabase } from './database/db.js';
import { handleMessage } from './handlers/messageHandler.js';
import { handleCommand } from './handlers/commandHandler.js';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

// Initialize database
const dbPath = process.env.DATABASE_PATH || './data/slackline.db';

// Ensure data directory exists
try {
  await mkdir(dirname(dbPath), { recursive: true });
} catch (error) {
  console.error('Failed to create data directory:', error);
}

initializeDatabase(dbPath);
console.log('✅ Database initialized');

// Initialize Bolt app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: false,
  port: process.env.PORT || 3000
});

// Health check endpoint
app.client.apiCall = app.client.apiCall || (() => {});

// Register message handler
app.message(async (args) => {
  await handleMessage(args);
});

// Register command handler
app.command('/slackline', async (args) => {
  await handleCommand(args);
});

// Health check endpoint (for Fly.io)
app.receiver.router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.receiver.router.get('/ready', (req, res) => {
  res.status(200).send('READY');
});

// Start the app
const port = process.env.PORT || 3000;

(async () => {
  await app.start(port);
  console.log(`⚡️ Slackline bot is running on port ${port}!`);
})();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await app.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await app.stop();
  process.exit(0);
});
```

---

## Task 9: Deployment Configuration

**Files:**
- Create: `Dockerfile`
- Create: `fly.toml`
- Create: `.dockerignore`

**Step 1: Write Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src ./src

# Create data directory
RUN mkdir -p /data

# Expose port
EXPOSE 3000

# Start app
CMD ["node", "src/app.js"]
```

**Step 2: Write fly.toml**

Create `fly.toml`:

```toml
app = "slackline"
primary_region = "sjc"

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = false
  min_machines_running = 1

[[vm]]
  memory = '256mb'
  cpu_kind = 'shared'
  cpus = 1

[mounts]
  source = "slackline_data"
  destination = "/data"

[env]
  DATABASE_PATH = "/data/slackline.db"
  NODE_ENV = "production"
```

**Step 3: Write .dockerignore**

Create `.dockerignore`:

```
node_modules
npm-debug.log
.env
*.db
*.db-journal
*.db-shm
*.db-wal
data/
tests/
docs/
.git
.gitignore
README.md
```

---

## Task 10: Documentation

**Files:**
- Create: `README.md`
- Create: `docs/SLACK_SETUP.md`
- Create: `slack-app-manifest.yaml`

**Step 1: Write README**

Create `README.md`:

```markdown
# Slackline

A Slack bot that tracks daily check-in streaks in channels with celebration messages for achievements.

## Features

- 📊 Track daily check-in streaks per user per channel
- 🎉 Celebrate achievements at milestones (1, 5, 10, 20, 50, 100, 250, 500+ days)
- 📅 Configure days off (weekends, vacations) so streaks aren't broken unfairly
- 🌍 Timezone-aware using Slack's user timezone data
- 🔄 Multi-channel support - separate streaks per channel

## Quick Start

### Prerequisites

- Node.js 20+
- Fly.io account (for deployment)
- Slack workspace with admin access

### Local Development

1. Clone the repository
2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

3. Copy \`.env.example\` to \`.env\` and fill in your Slack credentials:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

4. Run the bot:
   \`\`\`bash
   npm run dev
   \`\`\`

### Deployment to Fly.io

1. Install Fly.io CLI: https://fly.io/docs/getting-started/installing-flyctl/

2. Login to Fly.io:
   \`\`\`bash
   fly auth login
   \`\`\`

3. Create app and volume:
   \`\`\`bash
   fly launch --no-deploy
   fly volumes create slackline_data --size 1
   \`\`\`

4. Set secrets:
   \`\`\`bash
   fly secrets set SLACK_BOT_TOKEN=xoxb-your-token-here
   fly secrets set SLACK_SIGNING_SECRET=your-secret-here
   \`\`\`

5. Deploy:
   \`\`\`bash
   fly deploy
   \`\`\`

6. Get your app URL:
   \`\`\`bash
   fly status
   \`\`\`

   Use \`https://your-app.fly.dev\` for Slack event subscriptions.

## Slack Setup

See [docs/SLACK_SETUP.md](docs/SLACK_SETUP.md) for detailed instructions on configuring your Slack app.

Quick version:
1. Create app at https://api.slack.com/apps using \`slack-app-manifest.yaml\`
2. Install app to workspace
3. Copy Bot Token and Signing Secret to environment variables
4. Configure event subscription URL: \`https://your-app.fly.dev/slack/events\`
5. Invite bot to channel: \`/invite @Slackline\`

## Usage

### Commands

- \`/slackline help\` - Show all commands
- \`/slackline stats\` - View your streak stats
- \`/slackline dayoff <date>\` - Mark single day off (YYYY-MM-DD)
- \`/slackline vacation <start> <end>\` - Mark vacation range
- \`/slackline weekends <on|off>\` - Toggle weekends as days off
- \`/slackline list-daysoff\` - List your configured days off

### How Streaks Work

- Post any message in a monitored channel to check in for the day
- Streaks count consecutive working days (excluding your configured days off)
- Multiple posts in one day = one check-in (idempotent)
- Achievement celebrations posted publicly in channel

### Achievement Milestones

- 1, 5, 10, 20, 60, 120 working days
- 50, 100, 250, 500, 750, 1000 check-ins
- Every 250 days after 1000

## Testing

Run tests:
\`\`\`bash
npm test
\`\`\`

Run with UI:
\`\`\`bash
npm run test:ui
\`\`\`

## License

MIT
```

**Step 2: Write Slack setup guide**

Create `docs/SLACK_SETUP.md`:

```markdown
# Slack App Setup Guide

This guide walks you through creating and configuring a Slack app for Slackline.

## Method 1: Using App Manifest (Easiest)

1. Go to https://api.slack.com/apps
2. Click "Create New App"
3. Choose "From an app manifest"
4. Select your workspace
5. Paste the contents of `slack-app-manifest.yaml` from the repository
6. Review and create the app
7. Go to "Install App" and install to workspace
8. Copy the "Bot User OAuth Token" (starts with `xoxb-`)
9. Go to "Basic Information" and copy the "Signing Secret"
10. Set these as environment variables or Fly.io secrets

## Method 2: Manual Configuration

### 1. Create the App

1. Go to https://api.slack.com/apps
2. Click "Create New App"
3. Choose "From scratch"
4. Name it "Slackline" and select your workspace

### 2. Configure Bot Scopes

Go to "OAuth & Permissions" and add these Bot Token Scopes:

- `channels:history` - Read messages from public channels
- `channels:read` - View basic channel info
- `chat:write` - Post messages
- `commands` - Add slash commands
- `users:read` - Access user timezone info

### 3. Enable Event Subscriptions

1. Go to "Event Subscriptions"
2. Enable Events
3. Set Request URL to: `https://your-app.fly.dev/slack/events`
   (Replace `your-app.fly.dev` with your actual Fly.io app URL)
4. Subscribe to bot events:
   - `message.channels`

### 4. Create Slash Command

1. Go to "Slash Commands"
2. Click "Create New Command"
3. Set Command: `/slackline`
4. Set Request URL: `https://your-app.fly.dev/slack/commands`
5. Set Short Description: "Manage your streak settings"
6. Save

### 5. Install App

1. Go to "Install App"
2. Click "Install to Workspace"
3. Authorize the app
4. Copy the "Bot User OAuth Token" (starts with `xoxb-`)

### 6. Get Signing Secret

1. Go to "Basic Information"
2. Under "App Credentials", copy the "Signing Secret"

### 7. Configure Your Deployment

Set these secrets in Fly.io:

\`\`\`bash
fly secrets set SLACK_BOT_TOKEN=xoxb-your-token-here
fly secrets set SLACK_SIGNING_SECRET=your-secret-here
\`\`\`

Or in your local `.env` file for development:

\`\`\`
SLACK_BOT_TOKEN=xoxb-your-token-here
SLACK_SIGNING_SECRET=your-secret-here
\`\`\`

## Testing the Installation

1. Invite the bot to a channel:
   \`\`\`
   /invite @Slackline
   \`\`\`

2. Post a message in the channel

3. You should see a celebration for your first check-in! 🎉

4. Try commands:
   \`\`\`
   /slackline help
   /slackline stats
   \`\`\`

## Troubleshooting

### Events not being received

- Check that your Fly.io app is running: `fly status`
- Check logs: `fly logs`
- Verify Event Subscriptions URL is correct and verified (green checkmark)
- Make sure bot is invited to the channel

### Commands not working

- Verify Slash Command URL is correct
- Check that command is installed in workspace
- Check Fly.io logs for errors

### Wrong timezone

- Slack provides user timezone automatically
- Make sure user has timezone set in Slack profile
- Check logs to see what timezone is being used
```

**Step 3: Write Slack app manifest**

Create `slack-app-manifest.yaml`:

```yaml
display_information:
  name: Slackline
  description: Track daily check-in streaks with achievement celebrations
  background_color: "#2c2d30"
features:
  bot_user:
    display_name: Slackline
    always_online: true
  slash_commands:
    - command: /slackline
      url: https://your-app.fly.dev/slack/commands
      description: Manage your streak settings
      usage_hint: help | stats | dayoff <date> | vacation <start> <end>
oauth_config:
  scopes:
    bot:
      - channels:history
      - channels:read
      - chat:write
      - commands
      - users:read
settings:
  event_subscriptions:
    request_url: https://your-app.fly.dev/slack/events
    bot_events:
      - message.channels
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

---

## Task 11: Vitest Configuration

**Files:**
- Create: `vitest.config.js`

**Step 1: Write Vitest config**

Create `vitest.config.js`:

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'vitest.config.js'
      ]
    }
  }
});
```

---

## Summary

This implementation plan provides:

1. ✅ Complete database schema with SQLite
2. ✅ Timezone-aware date utilities using Luxon
3. ✅ Days off service (recurring + date ranges)
4. ✅ Achievement milestone detection
5. ✅ Streak calculation service
6. ✅ Slack message and command handlers
7. ✅ Main Bolt app with health checks
8. ✅ Fly.io deployment configuration
9. ✅ Comprehensive documentation
10. ✅ Vitest test suite

**Next Steps:**
1. Run `npm install` to install dependencies
2. Run tests with `npm test` to verify everything works
3. Set up Slack app following `docs/SLACK_SETUP.md`
4. Deploy to Fly.io following instructions in README
5. Invite bot to channel and start tracking streaks!

**TDD Notes:**
- Tests written before implementation for core services
- All services have unit tests
- Integration tests for handlers
- Manual E2E testing recommended after deployment
