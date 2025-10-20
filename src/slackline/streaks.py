"""Core streak tracking logic for Slackline."""
from __future__ import annotations

import logging
import sqlite3
from threading import RLock
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable, Optional

from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class StreakConfig:
    """Runtime configuration for the streak tracker."""

    off_days: frozenset[int]
    timezone: ZoneInfo

    @classmethod
    def from_settings(
        cls,
        off_days: Optional[Iterable[int]] = None,
        timezone: str = "UTC",
    ) -> "StreakConfig":
        """Create a :class:`StreakConfig` from raw settings."""

        off_days_set = frozenset(int(day) for day in (off_days or ()))
        tz = ZoneInfo(timezone)
        return cls(off_days=off_days_set, timezone=tz)


@dataclass
class RecordResult:
    """Result of recording a message."""

    channel_id: str
    user_id: str
    streak_length: int
    milestone_message: Optional[str] = None
    is_new_day: bool = True
    counted_toward_streak: bool = True


@dataclass(frozen=True)
class UserStreak:
    """Snapshot of a user's streak statistics."""

    current_streak: int
    longest_streak: int
    streak_start_date: Optional[date]
    last_counted_date: Optional[date]
    longest_streak_start: Optional[date]
    longest_streak_end: Optional[date]


class StreakTracker:
    """Persisted streak tracking for Slack channels."""

    TRACKING_MODE_ALL = "all"
    TRACKING_MODE_LIMITED = "limited"

    _MILESTONES = (
        7,
        14,
        30,
        60,
        90,
        180,
        365,
        730,
    )

    def __init__(
        self,
        db_path: str,
        config: Optional[StreakConfig] = None,
    ) -> None:
        path = Path(db_path)
        if path.parent and not path.parent.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
        self.db_path = str(path)
        self._config = config or StreakConfig.from_settings()
        self._lock = RLock()
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._initialise()

    @property
    def config(self) -> StreakConfig:
        return self._config

    def _initialise(self) -> None:
        with self._conn:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS streaks (
                    channel_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    current_streak INTEGER NOT NULL,
                    longest_streak INTEGER NOT NULL,
                    streak_start_date TEXT,
                    last_counted_date TEXT,
                    longest_streak_start TEXT,
                    longest_streak_end TEXT,
                    PRIMARY KEY (channel_id, user_id)
                )
                """
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS posts (
                    channel_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    post_date TEXT NOT NULL,
                    UNIQUE(channel_id, user_id, post_date)
                )
                """
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS tracked_channels (
                    channel_id TEXT PRIMARY KEY
                )
                """
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """
            )
            self._conn.execute(
                """
                INSERT OR IGNORE INTO settings (key, value)
                VALUES ('tracking_mode', ?)
                """,
                (self.TRACKING_MODE_ALL,),
            )

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # Channel tracking configuration -------------------------------------------------

    def get_tracking_mode(self) -> str:
        with self._lock:
            return self._get_tracking_mode_locked()

    def _get_tracking_mode_locked(self) -> str:
        cursor = self._conn.cursor()
        row = cursor.execute(
            "SELECT value FROM settings WHERE key = 'tracking_mode'"
        ).fetchone()
        if row is None:
            return self.TRACKING_MODE_ALL
        return str(row["value"])

    def set_tracking_mode(self, mode: str) -> None:
        if mode not in {self.TRACKING_MODE_ALL, self.TRACKING_MODE_LIMITED}:
            raise ValueError(f"Invalid tracking mode: {mode}")
        with self._lock:
            with self._conn:
                self._conn.execute(
                    """
                    INSERT INTO settings (key, value) VALUES ('tracking_mode', ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                    """,
                    (mode,),
                )
                if mode == self.TRACKING_MODE_ALL:
                    self._conn.execute("DELETE FROM tracked_channels")

    def enable_channel(self, channel_id: str) -> bool:
        with self._lock:
            with self._conn:
                self._conn.execute(
                    """
                    INSERT INTO settings (key, value) VALUES ('tracking_mode', ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                    """,
                    (self.TRACKING_MODE_LIMITED,),
                )
                cursor = self._conn.execute(
                    """
                    INSERT OR IGNORE INTO tracked_channels (channel_id)
                    VALUES (?)
                    """,
                    (channel_id,),
                )
        return cursor.rowcount > 0

    def disable_channel(self, channel_id: str) -> bool:
        with self._lock:
            with self._conn:
                cursor = self._conn.execute(
                    "DELETE FROM tracked_channels WHERE channel_id = ?",
                    (channel_id,),
                )
        return cursor.rowcount > 0

    def tracked_channels(self) -> list[str]:
        with self._lock:
            cursor = self._conn.cursor()
            rows = cursor.execute(
                "SELECT channel_id FROM tracked_channels ORDER BY channel_id"
            ).fetchall()
            return [str(row["channel_id"]) for row in rows]

    def is_channel_tracked(self, channel_id: str) -> bool:
        with self._lock:
            if self._get_tracking_mode_locked() == self.TRACKING_MODE_ALL:
                return True
            cursor = self._conn.cursor()
            row = cursor.execute(
                "SELECT 1 FROM tracked_channels WHERE channel_id = ?",
                (channel_id,),
            ).fetchone()
            return row is not None

    def is_tracking_restricted(self) -> bool:
        with self._lock:
            return self._get_tracking_mode_locked() == self.TRACKING_MODE_LIMITED

    def reset_channel_tracking(self) -> None:
        self.set_tracking_mode(self.TRACKING_MODE_ALL)

    def record_message(
        self,
        channel_id: str,
        user_id: str,
        timestamp: Optional[str | float | int] = None,
    ) -> RecordResult:
        """Record a message and update the user's streak."""

        if timestamp is None:
            now = datetime.now(tz=self.config.timezone)
        else:
            ts_float = float(timestamp)
            now = datetime.fromtimestamp(ts_float, tz=ZoneInfo("UTC")).astimezone(
                self.config.timezone
            )
        message_date = now.date()
        weekday = message_date.weekday()

        with self._lock:
            cursor = self._conn.cursor()
            with self._conn:
                inserted = cursor.execute(
                    """
                    INSERT OR IGNORE INTO posts (channel_id, user_id, post_date)
                    VALUES (?, ?, ?)
                    """,
                    (channel_id, user_id, message_date.isoformat()),
                ).rowcount

                streak_row = cursor.execute(
                    """
                    SELECT * FROM streaks WHERE channel_id = ? AND user_id = ?
                    """,
                    (channel_id, user_id),
                ).fetchone()

                if inserted == 0:
                    streak_length = (
                        int(streak_row["current_streak"]) if streak_row else 0
                    )
                    return RecordResult(
                        channel_id=channel_id,
                        user_id=user_id,
                        streak_length=streak_length,
                        milestone_message=None,
                        is_new_day=False,
                        counted_toward_streak=weekday not in self.config.off_days,
                    )

                if weekday in self.config.off_days:
                    if streak_row is None:
                        cursor.execute(
                            """
                            INSERT INTO streaks (
                                channel_id,
                                user_id,
                                current_streak,
                                longest_streak,
                                streak_start_date,
                                last_counted_date,
                                longest_streak_start,
                                longest_streak_end
                            ) VALUES (?, ?, 0, 0, NULL, NULL, NULL, NULL)
                            """,
                            (channel_id, user_id),
                        )
                    return RecordResult(
                        channel_id=channel_id,
                        user_id=user_id,
                        streak_length=int(
                            streak_row["current_streak"] if streak_row else 0
                        ),
                        milestone_message=None,
                        is_new_day=True,
                        counted_toward_streak=False,
                    )

                if streak_row is None or streak_row["last_counted_date"] is None:
                    streak_length = 1
                    cursor.execute(
                        """
                        INSERT INTO streaks (
                            channel_id,
                            user_id,
                            current_streak,
                            longest_streak,
                            streak_start_date,
                            last_counted_date,
                            longest_streak_start,
                            longest_streak_end
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(channel_id, user_id) DO UPDATE SET
                            current_streak=excluded.current_streak,
                            longest_streak=excluded.longest_streak,
                            streak_start_date=excluded.streak_start_date,
                            last_counted_date=excluded.last_counted_date,
                            longest_streak_start=excluded.longest_streak_start,
                            longest_streak_end=excluded.longest_streak_end
                        """,
                        (
                            channel_id,
                            user_id,
                            streak_length,
                            streak_length,
                            message_date.isoformat(),
                            message_date.isoformat(),
                            message_date.isoformat(),
                            message_date.isoformat(),
                        ),
                    )
                    milestone_message = self._milestone_message(
                        user_id, streak_length
                    )
                    return RecordResult(
                        channel_id=channel_id,
                        user_id=user_id,
                        streak_length=streak_length,
                        milestone_message=milestone_message,
                        is_new_day=True,
                        counted_toward_streak=True,
                    )

                last_counted = date.fromisoformat(streak_row["last_counted_date"])
                expected_next = self._next_required_date(last_counted)

                if message_date == expected_next:
                    streak_length = int(streak_row["current_streak"]) + 1
                    streak_start = streak_row["streak_start_date"] or message_date.isoformat()
                else:
                    if message_date < expected_next:
                        logger.debug(
                            "Received out-of-order message for %s on %s (expected %s)",
                            user_id,
                            message_date,
                            expected_next,
                        )
                        return RecordResult(
                            channel_id=channel_id,
                            user_id=user_id,
                            streak_length=int(streak_row["current_streak"]),
                            milestone_message=None,
                            is_new_day=True,
                            counted_toward_streak=False,
                        )
                    streak_length = 1
                    streak_start = message_date.isoformat()

                longest_streak = max(int(streak_row["longest_streak"]), streak_length)
                longest_start = streak_row["longest_streak_start"]
                longest_end = streak_row["longest_streak_end"]
                if streak_length > int(streak_row["longest_streak"]):
                    longest_start = (
                        streak_row["streak_start_date"]
                        if streak_length > 1
                        else message_date.isoformat()
                    )
                    longest_end = message_date.isoformat()

                cursor.execute(
                    """
                    UPDATE streaks
                    SET current_streak = ?,
                        longest_streak = ?,
                        streak_start_date = ?,
                        last_counted_date = ?,
                        longest_streak_start = ?,
                        longest_streak_end = ?
                    WHERE channel_id = ? AND user_id = ?
                    """,
                    (
                        streak_length,
                        longest_streak,
                        streak_start,
                        message_date.isoformat(),
                        longest_start,
                        longest_end,
                        channel_id,
                        user_id,
                    ),
                )

                milestone_message = self._milestone_message(user_id, streak_length)
                return RecordResult(
                    channel_id=channel_id,
                    user_id=user_id,
                    streak_length=streak_length,
                    milestone_message=milestone_message,
                    is_new_day=True,
                    counted_toward_streak=True,
                )

    def _next_required_date(self, start: date) -> date:
        current = start + timedelta(days=1)
        while current.weekday() in self.config.off_days:
            current += timedelta(days=1)
        return current

    def _milestone_message(self, user_id: str, streak_length: int) -> Optional[str]:
        if streak_length in self._MILESTONES:
            return (
                f":tada: <@{user_id}> just hit a {self._format_streak(streak_length)} streak!"
            )
        return None

    @staticmethod
    def _format_streak(days: int) -> str:
        if days % 365 == 0:
            years = days // 365
            return f"{years} year{'s' if years != 1 else ''}"
        if days % 30 == 0 and days >= 30:
            months = days // 30
            return f"{months} month{'s' if months != 1 else ''}"
        weeks = days // 7
        return f"{weeks} week{'s' if weeks != 1 else ''}"

    def _row_to_user_streak(self, row: sqlite3.Row) -> UserStreak:
        def parse(value: Optional[str]) -> Optional[date]:
            return date.fromisoformat(value) if value else None

        return UserStreak(
            current_streak=int(row["current_streak"]),
            longest_streak=int(row["longest_streak"]),
            streak_start_date=parse(row["streak_start_date"]),
            last_counted_date=parse(row["last_counted_date"]),
            longest_streak_start=parse(row["longest_streak_start"]),
            longest_streak_end=parse(row["longest_streak_end"]),
        )

    def get_user_streak(self, channel_id: str, user_id: str) -> Optional[UserStreak]:
        cursor = self._conn.cursor()
        row = cursor.execute(
            """
            SELECT current_streak,
                   longest_streak,
                   streak_start_date,
                   last_counted_date,
                   longest_streak_start,
                   longest_streak_end
            FROM streaks
            WHERE channel_id = ? AND user_id = ?
            """,
            (channel_id, user_id),
        ).fetchone()
        if row is None:
            return None
        return self._row_to_user_streak(row)

    def get_streak(self, channel_id: str, user_id: str) -> Optional[int]:
        stats = self.get_user_streak(channel_id, user_id)
        if stats is None:
            return None
        return stats.current_streak

    def leaderboard(self, channel_id: str, limit: int = 10) -> list[tuple[str, int]]:
        cursor = self._conn.cursor()
        rows = cursor.execute(
            """
            SELECT user_id, current_streak FROM streaks
            WHERE channel_id = ?
            ORDER BY current_streak DESC, user_id ASC
            LIMIT ?
            """,
            (channel_id, limit),
        ).fetchall()
        return [(row["user_id"], int(row["current_streak"])) for row in rows]
