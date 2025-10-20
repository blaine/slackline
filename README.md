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

   > **Note:** If you manage runtimes with [`mise`](https://mise.jdx.dev/) and the
   > precompiled Python download fails (for example with
   > `mise error decoding response body`), instruct mise to build Python from
   > source instead:
   >
   > ```bash
   > mise settings set python_compile 1
   > mise use -g python@3.11
   > ```
   >
   > Building takes longer, but sidesteps transient CDN download issues.

4. Copy `.env.example` to `.env` and fill in the credentials:

   ```bash
   cp .env.example .env
   ```

5. Run the development server:

   ```bash
   flask --app slackline.bot:create_flask_app run --port 3000
   ```

6. Expose the port to Slack (e.g. with ngrok) and update your Slack app's event and command request URLs to point to `/slack/events` and `/slack/commands` respectively.

## Deploying to Fly.io

Slackline ships with a production-ready `Dockerfile` and `fly.toml` that target Fly.io. Adjust the `app` name and `primary_region` in `fly.toml` to match your Fly organization, then deploy:

1. Install the [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) and authenticate:

   ```bash
   fly auth login
   ```

2. (Optional) If you want to keep chat history across deploys, provision a volume for the SQLite database:

   ```bash
   fly volumes create slackline_data --size 1 --region <region>
   ```

3. Configure the Slack credentials as Fly secrets:

   ```bash
   fly secrets set SLACK_BOT_TOKEN=xoxb-... SLACK_SIGNING_SECRET=...
   ```

4. Deploy the application:

   ```bash
   fly deploy
   ```

Fly will build the Docker image, run the container on port `8080`, and mount the persistent volume at `/data` (matching the default `SLACKLINE_DB` value in `fly.toml`). Update the Slack app's event and command URLs to point to your Fly app's hostname under `/slack/events` and `/slack/commands`.

## Configuration

Slackline reads configuration from environment variables:

- `SLACK_BOT_TOKEN` – Slack bot token (required).
- `SLACK_SIGNING_SECRET` – Slack signing secret (required).
- `SLACKLINE_DB` – Path to the SQLite database file (defaults to `slackline.db`).
- `SLACKLINE_OFF_DAYS` – Comma-separated list of weekday numbers (0=Monday … 6=Sunday) that do not require a post. Example: `5,6` to skip weekends.
- `SLACKLINE_TZ` – IANA timezone name used when interpreting message timestamps (defaults to `UTC`).

## Slash commands

- `/streak [@user]` – Shows the current streak for you (or the mentioned user) and highlights their personal best so far.
- `/streak-leaderboard` – Lists the top streak holders for the current channel.

## Testing

Run the unit test suite with:

```bash
pytest
```

## License

MIT
