import { App } from '@slack/bolt';
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

// Initialize Bolt app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: false,
  port: process.env.PORT || 3000
});

// Register message handler
app.message(async (args) => {
  await handleMessage(args);
});

// Register command handler
app.command('/slackline', async (args) => {
  await handleCommand(args);
});

// Health check endpoint (for Fly.io)
app.receiver.router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.receiver.router.get('/ready', (req, res) => {
  res.status(200).send('READY');
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
