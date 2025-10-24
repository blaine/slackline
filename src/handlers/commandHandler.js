import { getStreakStats } from '../services/streakService.js';
import {
  addDateRangeDayOff,
  setWeekendDaysOff,
  getUserDaysOff
} from '../services/daysOffService.js';
import { ensureUser } from '../services/streakService.js';
import { buildVacationModal } from '../modals/vacationModal.js';

/**
 * Handle /slackline slash command
 */
export async function handleCommand({ command, ack, respond, client }) {
  try {
    await ack();
  } catch (error) {
    console.error('❌ Error acknowledging command:', error);
    throw error;
  }

  try {
    const subcommand = command.text.trim().split(' ')[0].toLowerCase();
    const args = command.text.trim().split(' ').slice(1);

    switch (subcommand) {
      case 'help':
      case '':
        await handleHelp(respond);
        break;
      case 'stats':
        await handleStats(command, respond);
        break;
      case 'dayoff':
        await handleDayOff(command, args, respond, client);
        break;
      case 'vacation':
        await handleVacation(command, args, respond, client);
        break;
      case 'weekends':
        await handleWeekends(command, args, respond, client);
        break;
      case 'list-daysoff':
        await handleListDaysOff(command, respond, client);
        break;
      case 'settings':
        await handleSettings(command, respond, client);
        break;
      default:
        await respond({
          text: `Unknown command: ${subcommand}\n\nUse \`/slackline help\` to see available commands.`,
          response_type: 'ephemeral'
        });
    }
  } catch (error) {
    console.error('Error handling command:', error);
    await respond({
      text: '❌ An error occurred processing your command. Please try again.',
      response_type: 'ephemeral'
    });
  }
}

async function handleHelp(respond) {
  await respond({
    text: `*Slackline Bot Commands*

• \`/slackline help\` - Show this help message
• \`/slackline stats\` - View your current streak and total check-ins
• \`/slackline settings\` - Open vacation date picker
• \`/slackline dayoff <date>\` - Mark a single day off (YYYY-MM-DD)
  Example: \`/slackline dayoff 2024-12-25\`
• \`/slackline vacation <start> <end>\` - Mark a vacation range
  Example: \`/slackline vacation 2024-12-20 2024-12-31\`
• \`/slackline weekends <on|off>\` - Toggle Saturday/Sunday as days off
• \`/slackline list-daysoff\` - Show your configured days off

_Tip: You can also use the ⚡ shortcuts menu → "Set Vacation Dates"_`,
    response_type: 'ephemeral'
  });
}

async function handleStats(command, respond) {
  const stats = getStreakStats(command.user_id, command.channel_id);

  if (!stats || stats.total_checkins === 0) {
    await respond({
      text: `You haven't started a streak in this channel yet! Post a message to begin. 🎯`,
      response_type: 'ephemeral'
    });
    return;
  }

  await respond({
    text: `📊 *Your Streak Stats*

🔥 Current Streak: *${stats.current_streak} days*
✅ Total Check-ins: *${stats.total_checkins}*
📅 Last Post: ${stats.last_post_date}
🎬 Streak Started: ${stats.streak_start_date || 'N/A'}`,
    response_type: 'ephemeral'
  });
}

async function handleDayOff(command, args, respond, client) {
  if (args.length !== 1) {
    await respond({
      text: '❌ Usage: `/slackline dayoff <date>`\nExample: `/slackline dayoff 2024-12-25`',
      response_type: 'ephemeral'
    });
    return;
  }

  const date = args[0];

  // Validate date format (basic check)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    await respond({
      text: '❌ Invalid date format. Please use YYYY-MM-DD format.',
      response_type: 'ephemeral'
    });
    return;
  }

  // Get user timezone
  const userInfo = await client.users.info({ user: command.user_id });
  const timezone = userInfo.user.tz || 'UTC';

  const user = ensureUser(command.user_id, timezone);
  addDateRangeDayOff(user.id, date, date);

  await respond({
    text: `✅ Marked ${date} as a day off.`,
    response_type: 'ephemeral'
  });
}

async function handleVacation(command, args, respond, client) {
  if (args.length !== 2) {
    await respond({
      text: '❌ Usage: `/slackline vacation <start-date> <end-date>`\nExample: `/slackline vacation 2024-12-20 2024-12-31`',
      response_type: 'ephemeral'
    });
    return;
  }

  const [startDate, endDate] = args;

  // Validate date formats
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    await respond({
      text: '❌ Invalid date format. Please use YYYY-MM-DD format for both dates.',
      response_type: 'ephemeral'
    });
    return;
  }

  // Get user timezone
  const userInfo = await client.users.info({ user: command.user_id });
  const timezone = userInfo.user.tz || 'UTC';

  const user = ensureUser(command.user_id, timezone);
  addDateRangeDayOff(user.id, startDate, endDate);

  await respond({
    text: `✅ Marked ${startDate} to ${endDate} as vacation days.`,
    response_type: 'ephemeral'
  });
}

async function handleWeekends(command, args, respond, client) {
  if (args.length !== 1 || !['on', 'off'].includes(args[0].toLowerCase())) {
    await respond({
      text: '❌ Usage: `/slackline weekends <on|off>`',
      response_type: 'ephemeral'
    });
    return;
  }

  const enabled = args[0].toLowerCase() === 'on';

  // Get user timezone
  const userInfo = await client.users.info({ user: command.user_id });
  const timezone = userInfo.user.tz || 'UTC';

  const user = ensureUser(command.user_id, timezone);
  setWeekendDaysOff(user.id, enabled);

  await respond({
    text: `✅ Weekends (Saturday & Sunday) ${enabled ? 'enabled' : 'disabled'} as days off.`,
    response_type: 'ephemeral'
  });
}

async function handleListDaysOff(command, respond, client) {
  const userInfo = await client.users.info({ user: command.user_id });
  const timezone = userInfo.user.tz || 'UTC';

  const user = ensureUser(command.user_id, timezone);
  const daysOff = getUserDaysOff(user.id);

  if (daysOff.length === 0) {
    await respond({
      text: `You don't have any days off configured. Use \`/slackline weekends on\` or \`/slackline vacation\` to add some.`,
      response_type: 'ephemeral'
    });
    return;
  }

  const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let message = '*Your Days Off:*\n\n';

  const recurring = daysOff.filter(d => d.day_type === 'recurring_weekly');
  const ranges = daysOff.filter(d => d.day_type === 'date_range');

  if (recurring.length > 0) {
    message += '*Recurring Weekly:*\n';
    recurring.forEach(d => {
      message += `• ${weekDays[d.day_value]}\n`;
    });
    message += '\n';
  }

  if (ranges.length > 0) {
    message += '*Date Ranges:*\n';
    ranges.forEach(d => {
      if (d.start_date === d.end_date) {
        message += `• ${d.start_date}\n`;
      } else {
        message += `• ${d.start_date} to ${d.end_date}\n`;
      }
    });
  }

  await respond({
    text: message,
    response_type: 'ephemeral'
  });
}

async function handleSettings(command, respond, client) {
  try {
    // Open the vacation modal
    await client.views.open({
      trigger_id: command.trigger_id,
      view: buildVacationModal()
    });
  } catch (error) {
    console.error('Error opening settings modal:', error);
    await respond({
      text: '❌ Failed to open settings. Please try again.',
      response_type: 'ephemeral'
    });
  }
}
