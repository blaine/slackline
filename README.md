# slackline

Slackline is a Slack bot that tracks daily posting streaks within a channel. It keeps tabs on who shows up every required day, celebrates milestones, and gives the team a friendly nudge to keep conversations flowing.

## Features

- Track per-channel streaks for individual members.
- Configurable "off days" (for example weekends) that do not require a post.
- Celebrate streak milestones at 1 and 2 weeks, 1–3 months, 6 months, and 1–2 years.
- Slash commands for checking personal streaks and viewing the leaderboard.

## Getting started

1. Create a Slack app with the following scopes:
   - **Bot token scopes:** `app_mentions:read`, `channels:history`, `chat:write`, `commands`
   - **Event subscriptions:** subscribe to the `message.channels` event.
2. Install the app in your workspace and grab the **Bot User OAuth Token** and **Signing Secret**.
3. Clone this repository and install dependencies:

   ```bash
   pip install -e .[dev]
   ```

4. Copy `.env.example` to `.env` and fill in the credentials:

   ```bash
   cp .env.example .env
   ```

5. Run the development server:

   ```bash
   flask --app slackline.bot:create_flask_app run --port 3000
   ```

6. Expose the port to Slack (e.g. with ngrok) and update your Slack app's event and command request URLs to point to `/slack/events` and `/slack/commands` respectively.

## Configuration

Slackline reads configuration from environment variables:

- `SLACK_BOT_TOKEN` – Slack bot token (required).
- `SLACK_SIGNING_SECRET` – Slack signing secret (required).
- `SLACKLINE_DB` – Path to the SQLite database file (defaults to `slackline.db`).
- `SLACKLINE_OFF_DAYS` – Comma-separated list of weekday numbers (0=Monday … 6=Sunday) that do not require a post. Example: `5,6` to skip weekends.
- `SLACKLINE_TZ` – IANA timezone name used when interpreting message timestamps (defaults to `UTC`).

## Testing

Run the unit test suite with:

```bash
pytest
```

## License

MIT
