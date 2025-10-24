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
