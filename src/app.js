import pkg from '@slack/bolt';
const { App, ExpressReceiver } = pkg;
import { initializeDatabase } from './database/db.js';
import { handleMessage } from './handlers/messageHandler.js';
import { handleCommand } from './handlers/commandHandler.js';
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

// Create a custom receiver with health check endpoints
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// Add debug logging for all incoming requests - MUST be first!
receiver.router.use((req, res, next) => {
  console.log(`📥 Incoming request: ${req.method} ${req.path}`);
  next();
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
    version: '1.0.2-debug',
    timestamp: new Date().toISOString(),
    message: 'Debug logging enabled with correct middleware order'
  });
});

// Initialize Bolt app with custom receiver
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
  logLevel: 'DEBUG' // Enable debug logging to see what's happening
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
  } catch (error) {
    console.error('❌ Error in command handler:', error);
    throw error;
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
