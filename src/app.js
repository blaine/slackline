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

// Add debug logging to the MAIN Express app (not just router) - MUST be first!
receiver.app.use((req, res, next) => {
  console.log(`📥 Incoming request: ${req.method} ${req.path}`, {
    headers: {
      'x-slack-signature': req.headers['x-slack-signature']?.substring(0, 20) + '...',
      'x-slack-request-timestamp': req.headers['x-slack-request-timestamp'],
      'content-type': req.headers['content-type']
    }
  });

  // For slash commands, log the body
  if (req.path === '/slack/commands' && req.body) {
    console.log('  📝 Request body:', {
      command: req.body.command,
      text: req.body.text,
      user_id: req.body.user_id,
      channel_id: req.body.channel_id
    });
  }

  // Log when response is sent
  const originalSend = res.send;
  const originalJson = res.json;

  res.send = function(data) {
    console.log(`📤 Response sent for ${req.path}: status=${res.statusCode}, body=${typeof data === 'string' ? data.substring(0, 100) : JSON.stringify(data).substring(0, 100)}`);
    return originalSend.call(this, data);
  };

  res.json = function(data) {
    console.log(`📤 JSON Response sent for ${req.path}: status=${res.statusCode}, data=${JSON.stringify(data).substring(0, 100)}`);
    return originalJson.call(this, data);
  };

  next();
});

// Add error event listener to receiver
receiver.app.use((err, req, res, next) => {
  console.error('❌ Express error in receiver:', err);
  next(err);
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

// Initialize Bolt app with custom receiver and logger
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
  logger: logger,
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
    console.log('✅ Command handled successfully');
  } catch (error) {
    console.error('❌ Error in command handler:', error);
    throw error;
  }
});

// Add middleware to log ALL command attempts (even ones that don't match)
app.use(async ({ payload, next }) => {
  if (payload.command) {
    console.log('🔍 Bolt received command payload:', {
      command: payload.command,
      user: payload.user_id,
      channel: payload.channel_id
    });
  }
  await next();
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
