"""Slack Bolt app wiring for Slackline."""
from __future__ import annotations

import logging
import os
from typing import Optional

from dotenv import load_dotenv
from slack_bolt import App
from slack_bolt.adapter.flask import SlackRequestHandler
from slack_sdk.errors import SlackApiError

from .streaks import RecordResult, StreakConfig, StreakTracker, UserStreak

logger = logging.getLogger(__name__)


class SlacklineApp:
    """Wraps the Slack Bolt application and tracker."""

    def __init__(
        self,
        *,
        database_path: str,
        off_days: Optional[list[int]] = None,
        timezone: str = "UTC",
    ) -> None:
        load_dotenv()
        signing_secret = os.environ.get("SLACK_SIGNING_SECRET")
        bot_token = os.environ.get("SLACK_BOT_TOKEN")
        if not signing_secret or not bot_token:
            raise RuntimeError("Slack credentials are not configured")

        config = StreakConfig.from_settings(off_days=off_days, timezone=timezone)
        self.tracker = StreakTracker(database_path, config=config)
        self.app = App(token=bot_token, signing_secret=signing_secret)
        self._register_handlers()

    def _register_handlers(self) -> None:
        @self.app.event("message")
        def handle_message(event, say):  # type: ignore[no-redef]
            subtype = event.get("subtype")
            if subtype in {"message_changed", "message_deleted", "bot_message"}:
                return
            user = event.get("user")
            channel = event.get("channel")
            ts = event.get("ts")
            if not user or not channel or not ts:
                return
            if not self.tracker.is_channel_tracked(channel):
                return

            result = self.tracker.record_message(channel, user, ts)
            self._maybe_celebrate(result, say)

        @self.app.command("/streak")
        def show_streak(ack, respond, command):  # type: ignore[no-redef]
            ack()
            channel_id = command["channel_id"]
            if not self.tracker.is_channel_tracked(channel_id):
                respond(
                    "Streak tracking is disabled in this channel. "
                    "Run `/streak-tracking enable` to start tracking here."
                )
                return
            user_id = command.get("text") or command["user_id"]
            stats = self.tracker.get_user_streak(channel_id, user_id)
            if stats is None or stats.current_streak == 0:
                message = f"<@{user_id}> does not have an active streak yet."
                if stats and stats.longest_streak > 0:
                    message += (
                        f" Their longest streak so far is {stats.longest_streak} day"
                        f"{'s' if stats.longest_streak != 1 else ''}."
                    )
                respond(message)
            else:
                respond(self._format_streak_message(user_id, stats))

        @self.app.command("/streak-leaderboard")
        def show_leaderboard(ack, respond, command):  # type: ignore[no-redef]
            ack()
            channel_id = command["channel_id"]
            if not self.tracker.is_channel_tracked(channel_id):
                respond(
                    "Streak tracking is disabled in this channel. "
                    "Run `/streak-tracking enable` to start tracking here."
                )
                return
            leaderboard = self.tracker.leaderboard(channel_id)
            if not leaderboard:
                respond("No streaks recorded yet.")
                return
            lines = [":trophy: Current streak leaderboard:"]
            for idx, (user_id, streak) in enumerate(leaderboard, start=1):
                lines.append(f"{idx}. <@{user_id}> — {streak} day{'s' if streak != 1 else ''}")
            respond("\n".join(lines))

        @self.app.command("/streak-tracking")
        def configure_tracking(ack, respond, command):  # type: ignore[no-redef]
            ack()
            channel_id = command["channel_id"]
            text = (command.get("text") or "").strip().lower()
            parts = text.split()
            action = parts[0] if parts else ""

            if action in {"enable", "on", "start"}:
                enabled = self.tracker.enable_channel(channel_id)
                if enabled:
                    respond(
                        "Slackline will now track streaks in this channel. "
                        "Other channels must also opt in to be tracked."
                    )
                else:
                    respond("Streak tracking is already enabled in this channel.")
                return

            if action in {"disable", "off", "stop"}:
                disabled = self.tracker.disable_channel(channel_id)
                if disabled:
                    respond("Slackline will no longer track streaks in this channel.")
                else:
                    respond("Streak tracking was already disabled in this channel.")
                return

            if action in {"all", "reset", "any"}:
                self.tracker.reset_channel_tracking()
                respond(
                    "Slackline will track streaks in all channels. "
                    "Use `/streak-tracking disable` in a channel to return to opt-in mode."
                )
                return

            if action in {"status", "list"}:
                if not self.tracker.is_tracking_restricted():
                    respond(
                        "Slackline is tracking streaks in all channels. Run "
                        "`/streak-tracking disable` in a channel to return to opt-in tracking."
                    )
                else:
                    channels = self.tracker.tracked_channels()
                    if not channels:
                        respond(
                            "Slackline is currently not tracking any channels. Run "
                            "`/streak-tracking enable` in a channel to add it."
                        )
                    else:
                        formatted = ", ".join(f"`{cid}`" for cid in channels)
                        respond(
                            "Slackline is tracking streaks only in these channels: "
                            f"{formatted}."
                        )
                return

            current_state = (
                "tracking all channels"
                if not self.tracker.is_tracking_restricted()
                else "tracking only opted-in channels"
            )
            respond(
                "Usage: `/streak-tracking enable|disable|status|all`. "
                f"Slackline is currently {current_state}."
            )

    def handler(self) -> SlackRequestHandler:
        return SlackRequestHandler(self.app)

    def _maybe_celebrate(self, result: RecordResult, say) -> None:
        if result.milestone_message:
            try:
                say(result.milestone_message)
            except SlackApiError:
                logger.exception("Failed to send celebration message")

    def _format_streak_message(self, user_id: str, stats: UserStreak) -> str:
        message = f"<@{user_id}> is on a {stats.current_streak}-day streak!"
        if stats.longest_streak > stats.current_streak:
            message += (
                f" Their longest streak is {stats.longest_streak} day"
                f"{'s' if stats.longest_streak != 1 else ''}."
            )
        elif stats.longest_streak == stats.current_streak and stats.longest_streak > 0:
            message += " That's their personal best!"
        return message


def create_app() -> App:
    """Factory for the Slack Bolt app using environment variables."""

    database_path = os.environ.get("SLACKLINE_DB", "slackline.db")
    off_days_env = os.environ.get("SLACKLINE_OFF_DAYS", "")
    if off_days_env.strip():
        off_days = [int(part) for part in off_days_env.split(",")]
    else:
        off_days = None
    timezone = os.environ.get("SLACKLINE_TZ", "UTC")
    slackline = SlacklineApp(
        database_path=database_path,
        off_days=off_days,
        timezone=timezone,
    )
    return slackline.app


def create_flask_app():
    """Create a Flask application that proxies Slack requests to the Bolt app."""

    from flask import Flask, request

    bolt_app = create_app()
    handler = SlackRequestHandler(bolt_app)
    flask_app = Flask(__name__)

    @flask_app.post("/slack/events")
    def slack_events():
        return handler.handle(request)

    @flask_app.post("/slack/commands")
    def slack_commands():
        return handler.handle(request)

    return flask_app
