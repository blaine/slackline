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
