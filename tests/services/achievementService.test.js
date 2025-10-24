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
