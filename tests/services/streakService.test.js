import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeDatabase } from '../../src/database/db.js';
import {
  ensureUser,
  ensureChannel,
  processCheckin,
  getStreakStats
} from '../../src/services/streakService.js';
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
