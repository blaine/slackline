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
