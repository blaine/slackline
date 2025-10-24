# Slackline

A Slack bot that tracks daily check-in streaks in channels with celebration messages for achievements.

## Features

- 📊 Track daily check-in streaks per user per channel
- 🎉 Celebrate achievements at milestones (1, 5, 10, 20, 50, 100, 250, 500+ days)
- 📅 Configure days off (weekends, vacations) so streaks aren't broken unfairly
- 🌍 Timezone-aware using Slack's user timezone data
- 🔄 Multi-channel support - separate streaks per channel

## Quick Start

### Prerequisites

- Node.js 20+
- Fly.io account (for deployment)
- Slack workspace with admin access

### Local Development

1. Clone the repository

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in your Slack credentials:
   ```bash
   cp .env.example .env
   ```

4. Run the bot:
   ```bash
   npm run dev
   ```

### Deployment to Fly.io

1. Install Fly.io CLI: https://fly.io/docs/getting-started/installing-flyctl/

2. Login to Fly.io:
   ```bash
   fly auth login
   ```

3. Create app and volume:
   ```bash
   fly launch --no-deploy
   fly volumes create slackline_data --size 1
   ```

4. Set secrets:
   ```bash
   fly secrets set SLACK_BOT_TOKEN=xoxb-your-token-here
   fly secrets set SLACK_SIGNING_SECRET=your-secret-here
   ```

5. Deploy:
   ```bash
   fly deploy
   ```

6. Get your app URL:
   ```bash
   fly status
   ```

   Use `https://your-app.fly.dev` for Slack event subscriptions.

## Slack Setup

See [docs/SLACK_SETUP.md](docs/SLACK_SETUP.md) for detailed instructions on configuring your Slack app.

Quick version:
1. Create app at https://api.slack.com/apps using `slack-app-manifest.yaml`
2. Install app to workspace
3. Copy Bot Token and Signing Secret to environment variables
4. Configure event subscription URL: `https://your-app.fly.dev/slack/events`
5. Invite bot to channel: `/invite @Slackline`

## Usage

### Commands

- `/slackline help` - Show all commands
- `/slackline stats` - View your streak stats
- `/slackline dayoff <date>` - Mark single day off (YYYY-MM-DD)
- `/slackline vacation <start> <end>` - Mark vacation range
- `/slackline weekends <on|off>` - Toggle weekends as days off
- `/slackline list-daysoff` - List your configured days off

### How Streaks Work

- Post any message in a monitored channel to check in for the day
- Streaks count consecutive working days (excluding your configured days off)
- Multiple posts in one day = one check-in (idempotent)
- Achievement celebrations posted publicly in channel

### Achievement Milestones

- 1, 5, 10, 20, 60, 120 working days
- 50, 100, 250, 500, 750, 1000 check-ins
- Every 250 days after 1000

## Development

### Running Tests

Run all tests:
```bash
npm test
```

Run tests with UI:
```bash
npm run test:ui
```

Run with coverage:
```bash
npm run test:coverage
```

### Project Structure

```
slackline/
├── src/
│   ├── app.js                 # Main entry point
│   ├── database/
│   │   ├── db.js             # SQLite connection
│   │   └── schema.sql        # Database schema
│   ├── handlers/
│   │   ├── messageHandler.js # Process messages
│   │   └── commandHandler.js # Handle commands
│   ├── services/
│   │   ├── streakService.js  # Streak calculation
│   │   ├── daysOffService.js # Days off logic
│   │   └── achievementService.js # Milestones
│   └── utils/
│       └── dateUtils.js      # Date helpers
├── tests/                    # Vitest test suite
├── docs/                     # Documentation
├── fly.toml                  # Fly.io config
└── Dockerfile
```

## Troubleshooting

### Bot not responding to messages

- Check bot is invited to channel: `/invite @Slackline`
- Verify app is running: `fly status`
- Check logs: `fly logs`
- Ensure event subscriptions are verified in Slack app settings

### Commands not working

- Verify slash command URL is correct in Slack app settings
- Check signing secret is correct
- Review logs for errors

### Wrong timezone

- Slack provides user timezone from profile automatically
- Users should ensure timezone is set in their Slack profile
- Check logs to see detected timezone

## Contributing

Contributions welcome! Please open an issue or PR.

## License

MIT
