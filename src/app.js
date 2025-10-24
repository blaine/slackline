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

// Add health check endpoints to the Express router
// These are just plain HTTP endpoints - no auth required
receiver.router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

receiver.router.get('/ready', (req, res) => {
  res.status(200).send('READY');
});

// Initialize Bolt app with custom receiver
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver
});

// Register message handler
app.message(async (args) => {
  await handleMessage(args);
});

// Register command handler
app.command('/slackline', async (args) => {
  await handleCommand(args);
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
