/**
 * Rusty's Mad-Libs Exclamation Generator! 🐿️
 */
const RUSTY_VOCAB = {
  nuts: ['acorns', 'hazelnuts', 'chestnuts', 'walnuts', 'pecans', 'almonds'],
  descriptors: ['great googly', 'holy', 'sweet', 'jumpin\'', 'flyin\'', 'hot diggity'],
  intensifiers: ['OH. MY.', 'SWEET', 'HOLY', 'GREAT', 'JUMPIN\'', 'ABSOLUTE'],
  trees: ['oak', 'maple', 'pine', 'birch', 'willow'],
  actions: ['spins around', 'does a backflip', 'bounces excitedly', 'runs in circles', 'climbs rapidly', 'tail wiggles', 'chittering loudly'],
  nature: ['tree-mendous', 'un-be-LEAF-able', 'spec-TWIG-ular', 'oak-kay', 'pine-credible'],
  phrases: [
    'This is NUTS!',
    'I\'m going BONKERS!',
    'Butter my acorns!',
    'By my bushy tail!',
    'I could just fall out of my tree!',
    'This is driving me NUTS in the BEST way!',
    'I\'m absolutely SQUIRRELLY over this!'
  ]
};

/**
 * Generate a random Rusty-style exclamation
 */
function generateExclamation() {
  const templates = [
    () => `${pick(RUSTY_VOCAB.intensifiers)} ${pick(RUSTY_VOCAB.nuts).toUpperCase()}!`,
    () => `${pick(RUSTY_VOCAB.descriptors)} ${pick(RUSTY_VOCAB.nuts)}!`.toUpperCase(),
    () => `By my ${pick(['bushy tail', 'favorite acorn', 'whiskers', 'fuzzy ears'])}!`,
    () => pick(RUSTY_VOCAB.phrases)
  ];
  return pick(templates)();
}

/**
 * Generate a random action description
 */
function generateAction() {
  return `*${pick(RUSTY_VOCAB.actions)}*`;
}

/**
 * Pick random item from array
 */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Define achievement milestones
 * Format: { days: number, message: string }
 * Featuring: Rusty the Roundabout Squirrel! 🐿️
 */
const MILESTONES = [
  { days: 1, message: () => `${generateExclamation()} You've taken your first step onto the slackline! Welcome to the tree-tops, friend! 🌰` },
  { days: 5, message: () => `${generateExclamation()} ${generateAction()} FIVE DAYS?! You're getting the hang of this balance thing! Keep those paws steady! 🐿️` },
  { days: 10, message: () => `${generateExclamation()} Ten days and you haven't fallen off once! *mischievous chittering* You might just have what it takes! ⚡` },
  { days: 20, message: () => `TWENTY DAYS! ${generateAction()} ${pick(RUSTY_VOCAB.nature)}! I've been watching you from my branch and WOW, you're really nailing this! The whole forest is talking about you! 🌲` },
  { days: 50, message: () => `${generateExclamation()} FIFTY DAYS?! ${generateAction()} That's like... SO MANY ${pick(RUSTY_VOCAB.nuts)} worth of dedication! You absolute LEGEND! 🌟` },
  { days: 60, message: () => `${generateExclamation()} *eyes get SUPER wide* Sixty days?! Do you know how many tree-laps that is?! SPOILER: It's a lot! You're officially unstoppable! 🚀` },
  { days: 100, message: () => `STOP EVERYTHING! *dramatic pause* ONE. HUNDRED. DAYS! ${pick(RUSTY_VOCAB.phrases)} I just buried an extra-special ${pick(RUSTY_VOCAB.nuts)} in your honor! You're in the Squirrel Hall of Fame now! 🏆` },
  { days: 120, message: () => `*hanging upside down from a branch* HELLOOO down there, superstar! 120 DAYS! ${pick(RUSTY_VOCAB.nature)}! Even the wise old owls are impressed! Who's awesome? YOU'RE AWESOME! 🦉✨` },
  { days: 250, message: () => `${generateExclamation()} ${generateAction()} TWO HUNDRED AND FIFTY DAYS! I'm going absolutely BONKERS over here! You're like the Squirrel Supreme Champion of Everything! 👑` },
  { days: 500, message: () => `*faints dramatically then pops back up* ${generateExclamation()} FIVE HUNDRED?! FIVE. HUNDRED. DAYS?! ${pick(RUSTY_VOCAB.phrases)} I'm renaming my favorite ${pick(RUSTY_VOCAB.trees)} after you! 🎊🌰` },
  { days: 750, message: () => `Okay so like... *whispers conspiratorially* ...between you and me, I've never seen ANYONE this dedicated. 750 DAYS! ${generateExclamation()} You're basically a forest legend now! 🌠` },
  { days: 1000, message: () => `🚨 ACORN ALERT! ACORN ALERT! 🚨 *climbs to highest branch and SCREAMS* ONE THOUSAND DAYS! ${generateExclamation()} I'm organizing a parade! With ${pick(RUSTY_VOCAB.nuts)}! SO MANY ${pick(RUSTY_VOCAB.nuts).toUpperCase()}! ${pick(RUSTY_VOCAB.phrases)} 🎆🐿️🌰` }
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
    return {
      days: milestone.days,
      message: milestone.message() // Call the function to generate the message
    };
  }

  // Check ongoing milestones (every 250 after 1000) - fully mad-libs style!
  if (streakCount > 1000 && streakCount % ONGOING_MILESTONE_INTERVAL === 0) {
    const ongoingTemplates = [
      () => `${generateAction()} ${streakCount} DAYS?! ${generateExclamation()} I'm running out of ${pick(RUSTY_VOCAB.nuts)} to celebrate with! You're absolutely INCREDIBLE! 🌟🐿️🌰`,
      () => `${generateExclamation()} ${streakCount} days?! ${generateAction()} This is ${pick(RUSTY_VOCAB.nature)} and completely NUTS! You're a legend! 🌰✨`,
      () => `${generateExclamation()} ${streakCount} DAYS?! I'm gonna need a bigger ${pick(RUSTY_VOCAB.trees)} to store all these celebration ${pick(RUSTY_VOCAB.nuts)}! ${pick(RUSTY_VOCAB.nature)}! 🌲🐿️`
    ];
    return {
      days: streakCount,
      message: pick(ongoingTemplates)()
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
  return MILESTONES.map(m => ({ days: m.days, message: m.message() }));
}
