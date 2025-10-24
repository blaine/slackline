/**
 * Define achievement milestones
 * Format: { days: number, message: string }
 * Featuring: Rusty the Roundabout Squirrel! 🐿️
 */
const MILESTONES = [
  { days: 1, message: "OH. MY. ACORNS! You've taken your first step onto the slackline! Welcome to the tree-tops, friend! 🌰" },
  { days: 5, message: "*does a little tail wiggle* FIVE DAYS?! You're getting the hang of this balance thing! Keep those paws steady! 🐿️" },
  { days: 10, message: "Well well WELL! Ten days and you haven't fallen off once! *mischievous chittering* You might just have what it takes! ⚡" },
  { days: 20, message: "TWENTY DAYS! *bounces excitedly* I've been watching you from my branch and WOW, you're really nailing this! The whole forest is talking about you! 🌲" },
  { days: 50, message: "OH. MY. ACORNS! FIFTY DAYS?! *spins around on tail* That's like... SO MANY ACORNS worth of dedication! You absolute LEGEND! 🌟" },
  { days: 60, message: "*eyes get SUPER wide* Sixty days?! Do you know how many tree-laps that is?! SPOILER: It's a lot! You're officially unstoppable! 🚀" },
  { days: 100, message: "STOP EVERYTHING! *dramatic pause* ONE. HUNDRED. DAYS! I just buried an extra-special acorn in your honor! You're in the Squirrel Hall of Fame now! 🏆" },
  { days: 120, message: "*hanging upside down from a branch* HELLOOO down there, superstar! 120 DAYS! Even the wise old owls are impressed! Who's awesome? YOU'RE AWESOME! 🦉✨" },
  { days: 250, message: "OH MY OH MY OH MY ACORNS! *runs in circles* TWO HUNDRED AND FIFTY DAYS! I literally can't even! You're like the Squirrel Supreme Champion of Everything! 👑" },
  { days: 500, message: "*faints dramatically then pops back up* FIVE HUNDRED?! FIVE. HUNDRED. DAYS?! I'm renaming my favorite tree after you! This is NUTS! 🎊🌰" },
  { days: 750, message: "Okay so like... *whispers conspiratorially* ...between you and me, I've never seen ANYONE this dedicated. 750 DAYS! You're basically a forest legend now! 🌠" },
  { days: 1000, message: "🚨 ACORN ALERT! ACORN ALERT! 🚨 *climbs to highest branch and SCREAMS* ONE THOUSAND DAYS! OH. MY. ACORNS! I'm organizing a parade! With acorns! SO MANY ACORNS! 🎆🐿️🌰" }
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
      message: `*does backflip* ${streakCount} DAYS?! I'm running out of acorns to celebrate with! You're absolutely INCREDIBLE! Never stop being amazing! 🌟🐿️🌰`
    };
  }

  return null;
}

/**
 * Format achievement celebration message
 */
export function formatAchievementMessage(userId, achievement) {
  return `🐿️ *Rusty the Roundabout Squirrel scampers in* 🐿️

HEY <@${userId}>! You've hit **${achievement.days} days** on the slackline!

${achievement.message}`;
}

/**
 * Get all milestone values (for testing/reference)
 */
export function getAllMilestones() {
  return [...MILESTONES];
}
