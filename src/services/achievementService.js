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
