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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

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

        logger.info(
            "Slackline app initialised with database=%s timezone=%s off_days=%s",
            database_path,
            timezone,
            sorted(config.off_days) if config.off_days else [],
        )

        try:
            auth_response = self.app.client.auth_test()
        except SlackApiError:
            logger.exception("Failed to authenticate Slack client during startup")
            raise
        else:
            logger.info(
                "Authenticated with Slack",
                extra={
                    "team_id": auth_response.get("team_id"),
                    "team_name": auth_response.get("team"),
                    "bot_user_id": auth_response.get("bot_user_id"),
                    "bot_id": auth_response.get("bot_id"),
                    "url": auth_response.get("url"),
                },
            )

    def _register_handlers(self) -> None:
        @self.app.event("message")
        def handle_message(event, say):  # type: ignore[no-redef]
            logger.info("Received Slack event", extra={"event": event})
            subtype = event.get("subtype")
            if subtype in {"message_changed", "message_deleted", "bot_message"}:
                return
            user = event.get("user")
            channel = event.get("channel")
            ts = event.get("ts")
            if not user or not channel or not ts:
                return
            if not self.tracker.is_channel_tracked(channel):
                logger.debug(
                    "Ignoring message in untracked channel",
                    extra={"channel_id": channel, "user_id": user},
                )
                return

            result = self.tracker.record_message(channel, user, ts)
            if result.counted_toward_streak:
                logger.info(
                    "Recorded streak activity", extra={
                        "channel_id": channel,
                        "user_id": user,
                        "streak_length": result.streak_length,
                        "new_day": result.is_new_day,
                    }
                )
            else:
                logger.debug(
                    "Message did not count toward streak", extra={
                        "channel_id": channel,
                        "user_id": user,
                        "new_day": result.is_new_day,
                    }
                )
            self._maybe_celebrate(result, say)

        @self.app.command("/streak")
        def show_streak(ack, respond, command):  # type: ignore[no-redef]
            ack()
            logger.info("Received Slack command", extra={"command": command})
            channel_id = command["channel_id"]
            if not self.tracker.is_channel_tracked(channel_id):
                message = (
                    "Streak tracking is disabled in this channel. "
                    "Run `/streak-tracking enable` to start tracking here."
                )
                self._log_outgoing_message(channel_id, message)
                respond(message)
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
                self._log_outgoing_message(channel_id, message)
                respond(message)
            else:
                response = self._format_streak_message(user_id, stats)
                self._log_outgoing_message(channel_id, response)
                respond(response)

        @self.app.command("/streak-leaderboard")
        def show_leaderboard(ack, respond, command):  # type: ignore[no-redef]
            ack()
            logger.info("Received Slack command", extra={"command": command})
            channel_id = command["channel_id"]
            if not self.tracker.is_channel_tracked(channel_id):
                message = (
                    "Streak tracking is disabled in this channel. "
                    "Run `/streak-tracking enable` to start tracking here."
                )
                self._log_outgoing_message(channel_id, message)
                respond(message)
                return
            leaderboard = self.tracker.leaderboard(channel_id)
            if not leaderboard:
                message = "No streaks recorded yet."
                self._log_outgoing_message(channel_id, message)
                respond(message)
                return
            lines = [":trophy: Current streak leaderboard:"]
            for idx, (user_id, streak) in enumerate(leaderboard, start=1):
                lines.append(f"{idx}. <@{user_id}> — {streak} day{'s' if streak != 1 else ''}")
            message = "\n".join(lines)
            self._log_outgoing_message(channel_id, message)
            respond(message)

        @self.app.command("/streak-tracking")
        def configure_tracking(ack, respond, command):  # type: ignore[no-redef]
            ack()
            logger.info("Received Slack command", extra={"command": command})
            channel_id = command["channel_id"]
            text = (command.get("text") or "").strip().lower()
            parts = text.split()
            action = parts[0] if parts else ""

            if action in {"enable", "on", "start"}:
                enabled = self.tracker.enable_channel(channel_id)
                if enabled:
                    message = (
                        "Slackline will now track streaks in this channel. "
                        "Other channels must also opt in to be tracked."
                    )
                    self._log_outgoing_message(channel_id, message)
                    respond(message)
                    logger.info("Enabled tracking for channel", extra={"channel_id": channel_id})
                else:
                    message = "Streak tracking is already enabled in this channel."
                    self._log_outgoing_message(channel_id, message)
                    respond(message)
                return

            if action in {"disable", "off", "stop"}:
                disabled = self.tracker.disable_channel(channel_id)
                if disabled:
                    message = "Slackline will no longer track streaks in this channel."
                    self._log_outgoing_message(channel_id, message)
                    respond(message)
                    logger.info(
                        "Disabled tracking for channel", extra={"channel_id": channel_id}
                    )
                else:
                    message = "Streak tracking was already disabled in this channel."
                    self._log_outgoing_message(channel_id, message)
                    respond(message)
                return

            if action in {"all", "reset", "any"}:
                self.tracker.reset_channel_tracking()
                message = (
                    "Slackline now requires each channel to opt in for tracking. "
                    "I've cleared the tracked channel list; run `/streak-tracking enable` "
                    "in the channels you want monitored."
                )
                self._log_outgoing_message(channel_id, message)
                respond(message)
                logger.info(
                    "Cleared tracked channels to enforce opt-in tracking",
                    extra={"channel_id": channel_id},
                )
                return

            if action in {"status", "list"}:
                channels = self.tracker.tracked_channels()
                if not channels:
                    message = (
                        "Slackline is currently not tracking any channels. Run "
                        "`/streak-tracking enable` in a channel to add it."
                    )
                    self._log_outgoing_message(channel_id, message)
                    respond(message)
                else:
                    formatted = ", ".join(f"`{cid}`" for cid in channels)
                    message = (
                        "Slackline is tracking streaks only in these channels: "
                        f"{formatted}."
                    )
                    self._log_outgoing_message(channel_id, message)
                    respond(message)
                return

            current_state = (
                "tracking all channels"
                if not self.tracker.is_tracking_restricted()
                else "tracking only opted-in channels"
            )
            message = (
                "Usage: `/streak-tracking enable|disable|status|reset`. "
                f"Slackline is currently {current_state}."
            )
            self._log_outgoing_message(channel_id, message)
            respond(message)

    def handler(self) -> SlackRequestHandler:
        return SlackRequestHandler(self.app)

    def _maybe_celebrate(self, result: RecordResult, say) -> None:
        if result.milestone_message:
            logger.info(
                "Celebrating milestone", extra={
                    "channel_id": result.channel_id,
                    "user_id": result.user_id,
                    "streak_length": result.streak_length,
                }
            )
            try:
                self._log_outgoing_message(result.channel_id, result.milestone_message)
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

    @staticmethod
    def _log_outgoing_message(channel_id: str, message: str) -> None:
        logger.info(
            "Sending Slack response",
            extra={"channel_id": channel_id, "message": message},
        )


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
