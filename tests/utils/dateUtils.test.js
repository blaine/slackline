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
