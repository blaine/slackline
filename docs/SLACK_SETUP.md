# Slack App Setup Guide

This guide walks you through creating and configuring a Slack app for Slackline.

## Method 1: Using App Manifest (Easiest)

1. Go to https://api.slack.com/apps
2. Click "Create New App"
3. Choose "From an app manifest"
4. Select your workspace
5. Copy the contents of `slack-app-manifest.yaml` from the repository
6. Paste into the YAML tab
7. **IMPORTANT:** Replace `your-app.fly.dev` with your actual Fly.io app URL
8. Review and create the app
9. Go to "Install App" and install to workspace
10. Copy the "Bot User OAuth Token" (starts with `xoxb-`)
11. Go to "Basic Information" and copy the "Signing Secret"
12. Set these as environment variables or Fly.io secrets

## Method 2: Manual Configuration

### 1. Create the App

1. Go to https://api.slack.com/apps
2. Click "Create New App"
3. Choose "From scratch"
4. Name it "Slackline" and select your workspace

### 2. Configure Bot Scopes

Go to "OAuth & Permissions" and add these Bot Token Scopes:

- `channels:history` - Read messages from public channels
- `channels:read` - View basic channel info
- `chat:write` - Post messages
- `commands` - Add slash commands
- `users:read` - Access user timezone info

### 3. Enable Event Subscriptions

1. Go to "Event Subscriptions"
2. Enable Events
3. Set Request URL to: `https://your-app.fly.dev/slack/events`
   (Replace `your-app.fly.dev` with your actual Fly.io app URL)
4. Wait for verification (green checkmark)
5. Subscribe to bot events:
   - `message.channels`
6. Save Changes

### 4. Create Slash Command

1. Go to "Slash Commands"
2. Click "Create New Command"
3. Set Command: `/slackline`
4. Set Request URL: `https://your-app.fly.dev/slack/commands`
5. Set Short Description: "Manage your streak settings"
6. Set Usage Hint: `help | stats | dayoff <date> | vacation <start> <end>`
7. Save

### 5. Install App

1. Go to "Install App"
2. Click "Install to Workspace"
3. Authorize the app
4. Copy the "Bot User OAuth Token" (starts with `xoxb-`)

### 6. Get Signing Secret

1. Go to "Basic Information"
2. Under "App Credentials", copy the "Signing Secret"

### 7. Configure Your Deployment

Set these secrets in Fly.io:

```bash
fly secrets set SLACK_BOT_TOKEN=xoxb-your-token-here
fly secrets set SLACK_SIGNING_SECRET=your-secret-here
```

Or in your local `.env` file for development:

```
SLACK_BOT_TOKEN=xoxb-your-token-here
SLACK_SIGNING_SECRET=your-secret-here
```

## Testing the Installation

1. Invite the bot to a channel:
   ```
   /invite @Slackline
   ```

2. Post a message in the channel

3. You should see a celebration for your first check-in! 🎉

4. Try commands:
   ```
   /slackline help
   /slackline stats
   ```

## Troubleshooting

### Events not being received

- Check that your Fly.io app is running: `fly status`
- Check logs: `fly logs`
- Verify Event Subscriptions URL is correct and verified (green checkmark)
- Make sure bot is invited to the channel: `/invite @Slackline`
- Verify your app is publicly accessible at the URL you provided

### Commands not working

- Verify Slash Command URL is correct
- Check that command is installed in workspace
- Check Fly.io logs for errors: `fly logs`
- Ensure signing secret is correctly set

### Wrong timezone

- Slack provides user timezone automatically from user profiles
- Users should verify timezone is set in their Slack profile (Settings > Account > Timezone)
- Check bot logs to see what timezone is being detected

### Bot not responding

- Verify bot token starts with `xoxb-`
- Check that all required scopes are granted
- Review Fly.io logs for error messages
- Test health endpoint: `curl https://your-app.fly.dev/health`

## App Configuration Summary

**Required Bot Scopes:**
- channels:history
- channels:read
- chat:write
- commands
- users:read

**Event Subscriptions:**
- message.channels

**Slash Commands:**
- /slackline

**Request URLs:**
- Events: `https://your-app.fly.dev/slack/events`
- Commands: `https://your-app.fly.dev/slack/commands`
- Health Check: `https://your-app.fly.dev/health`
