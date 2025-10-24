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
