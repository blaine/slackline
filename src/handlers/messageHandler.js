import { processCheckin } from '../services/streakService.js';
import { checkAchievement, formatAchievementMessage } from '../services/achievementService.js';

/**
 * Handle incoming message events from Slack
 */
export async function handleMessage({ message, say, client }) {
  console.log('💬 Received message event:', {
    user: message.user,
    channel: message.channel,
    text: message.text?.substring(0, 50),
    subtype: message.subtype,
    thread_ts: message.thread_ts
  });

  try {
    // Ignore bot messages and threaded replies
    if (message.subtype || message.thread_ts) {
      console.log('  ↳ Ignoring: bot message or thread');
      return;
    }

    // Ignore messages without user (shouldn't happen, but safety check)
    if (!message.user) {
      console.log('  ↳ Ignoring: no user');
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
    console.log(`  ↳ Processing check-in for user ${message.user} in channel ${channelName}`);
    const result = processCheckin(
      message.user,
      message.channel,
      channelName,
      timezone
    );

    // If not updated (duplicate post today), do nothing
    if (!result.updated) {
      console.log(`  ↳ No update needed (already posted today), streak: ${result.streakCount}`);
      return;
    }

    console.log(`  ↳ Streak updated! New count: ${result.streakCount}`);

    // Check if this is an achievement
    const achievement = checkAchievement(result.streakCount);

    if (achievement) {
      console.log(`  ↳ 🎉 Achievement unlocked at ${result.streakCount} days!`);
      // Post celebration message as a threaded reply
      const celebrationMessage = formatAchievementMessage(message.user, achievement);
      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.ts,
        text: celebrationMessage
      });
    }

  } catch (error) {
    console.error('Error handling message:', error);
    // Don't throw - we don't want to crash on individual message failures
  }
}
