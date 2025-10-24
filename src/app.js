import pkg from '@slack/bolt';
const { App, ExpressReceiver } = pkg;
import { initializeDatabase } from './database/db.js';
import { handleMessage } from './handlers/messageHandler.js';
import { handleCommand } from './handlers/commandHandler.js';
import { buildVacationModal } from './modals/vacationModal.js';
import { ensureUser } from './services/streakService.js';
import { addDateRangeDayOff } from './services/daysOffService.js';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

// Initialize database
const dbPath = process.env.DATABASE_PATH || './data/slackline.db';

// Ensure data directory exists
try {
  await mkdir(dirname(dbPath), { recursive: true });
} catch (error) {
  console.error('Failed to create data directory:', error);
}

initializeDatabase(dbPath);
console.log('✅ Database initialized');

// Verify environment variables are set
const signingSecretLength = process.env.SLACK_SIGNING_SECRET?.length || 0;
const signingSecretValid = signingSecretLength === 32;
console.log('🔍 Environment check:', {
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN ? '✅ Set (length: ' + process.env.SLACK_BOT_TOKEN.length + ')' : '❌ Missing',
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET
    ? (signingSecretValid ? '✅ Set (32 chars)' : `⚠️ Set but wrong length (${signingSecretLength} chars, expected 32)`)
    : '❌ Missing',
  DATABASE_PATH: process.env.DATABASE_PATH || 'using default',
  NODE_ENV: process.env.NODE_ENV || 'not set'
});

// Create custom logger for Bolt to ensure output goes to console
const logger = {
  debug: (...msgs) => console.log('[BOLT DEBUG]', ...msgs),
  info: (...msgs) => console.log('[BOLT INFO]', ...msgs),
  warn: (...msgs) => console.warn('[BOLT WARN]', ...msgs),
  error: (...msgs) => console.error('[BOLT ERROR]', ...msgs),
  setLevel: () => {},
  getLevel: () => 'DEBUG',
  setName: () => {}
};

// Create a custom receiver with health check endpoints
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// Add health check endpoints to the Express router
// These are just plain HTTP endpoints - no auth required
receiver.router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

receiver.router.get('/ready', (req, res) => {
  res.status(200).send('READY');
});

receiver.router.get('/version', (req, res) => {
  res.status(200).json({
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    message: 'Slackline bot running'
  });
});

// Initialize Bolt app with custom receiver and logger
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
  logger: logger,
  logLevel: 'INFO' // Use INFO level for production
});

// Register message handler with error handling
app.message(async (args) => {
  try {
    await handleMessage(args);
  } catch (error) {
    console.error('❌ Error in message handler:', error);
  }
});

// Register command handler with error handling
app.command('/slackline', async (args) => {
  console.log('📝 Received /slackline command:', {
    user: args.command.user_id,
    channel: args.command.channel_id,
    text: args.command.text
  });
  try {
    await handleCommand(args);
    console.log('✅ Command handled successfully');
  } catch (error) {
    console.error('❌ Error in command handler:', error);
    throw error;
  }
});

// Register shortcut handler to open vacation modal
app.shortcut('open_vacation_modal', async ({ shortcut, ack, client }) => {
  await ack();

  try {
    await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: buildVacationModal()
    });
  } catch (error) {
    console.error('Error opening vacation modal:', error);
  }
});

// Handle vacation modal submission
app.view('vacation_submission', async ({ ack, body, view, client }) => {
  // Acknowledge the view submission
  await ack();

  try {
    // Extract the dates from the modal
    const startDate = view.state.values.start_date_block.start_date.selected_date;
    const endDate = view.state.values.end_date_block.end_date.selected_date;
    const userId = body.user.id;

    // Get user's timezone
    const userInfo = await client.users.info({ user: userId });
    const timezone = userInfo.user.tz || 'UTC';

    // Ensure user exists and add the vacation dates
    const user = ensureUser(userId, timezone);
    addDateRangeDayOff(user.id, startDate, endDate);

    // Send a confirmation message
    await client.chat.postMessage({
      channel: userId,
      text: `✅ Vacation dates saved! ${startDate} to ${endDate} are marked as days off.`
    });

    console.log(`User ${userId} set vacation: ${startDate} to ${endDate}`);
  } catch (error) {
    console.error('Error handling vacation submission:', error);
  }
});

// Global error handler
app.error(async (error) => {
  console.error('❌ Global error handler caught:', error);
});

// Start the app
const port = process.env.PORT || 3000;

(async () => {
  await app.start(port);
  console.log(`⚡️ Slackline bot is running on port ${port}!`);
})();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await app.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await app.stop();
  process.exit(0);
});
