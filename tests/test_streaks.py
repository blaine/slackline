from datetime import datetime, timedelta
import os
import sys
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from slackline.streaks import RecordResult, StreakConfig, StreakTracker


def make_tracker(tmp_path, off_days=None):
    config = StreakConfig.from_settings(off_days=off_days, timezone="UTC")
    db_path = tmp_path / "streaks.db"
    return StreakTracker(str(db_path), config=config)


def test_consecutive_days_increment(tmp_path):
    tracker = make_tracker(tmp_path)
    base = datetime(2024, 1, 1, tzinfo=ZoneInfo("UTC"))

    result = tracker.record_message("C1", "U1", base.timestamp())
    assert result.streak_length == 1

    result = tracker.record_message("C1", "U1", (base + timedelta(days=1)).timestamp())
    assert result.streak_length == 2


def test_weekend_does_not_break_streak(tmp_path):
    tracker = make_tracker(tmp_path, off_days={5, 6})
    friday = datetime(2024, 3, 1, tzinfo=ZoneInfo("UTC"))
    monday = datetime(2024, 3, 4, tzinfo=ZoneInfo("UTC"))

    tracker.record_message("C1", "U1", friday.timestamp())
    result = tracker.record_message("C1", "U1", monday.timestamp())

    assert result.streak_length == 2


def test_missing_required_day_resets_streak(tmp_path):
    tracker = make_tracker(tmp_path)
    base = datetime(2024, 1, 1, tzinfo=ZoneInfo("UTC"))

    tracker.record_message("C1", "U1", base.timestamp())
    tracker.record_message("C1", "U1", (base + timedelta(days=1)).timestamp())
    result = tracker.record_message("C1", "U1", (base + timedelta(days=3)).timestamp())

    assert result.streak_length == 1


def test_duplicate_message_same_day(tmp_path):
    tracker = make_tracker(tmp_path)
    base = datetime(2024, 1, 1, tzinfo=ZoneInfo("UTC"))
    ts = base.timestamp()

    first = tracker.record_message("C1", "U1", ts)
    duplicate = tracker.record_message("C1", "U1", ts)

    assert first.streak_length == 1
    assert duplicate.streak_length == 1
    assert duplicate.is_new_day is False


def test_off_day_post_does_not_increment(tmp_path):
    tracker = make_tracker(tmp_path, off_days={6})
    sunday = datetime(2024, 3, 3, tzinfo=ZoneInfo("UTC"))
    monday = datetime(2024, 3, 4, tzinfo=ZoneInfo("UTC"))

    off_day = tracker.record_message("C1", "U1", sunday.timestamp())
    assert off_day.counted_toward_streak is False

    monday_result = tracker.record_message("C1", "U1", monday.timestamp())
    assert monday_result.streak_length == 1


def test_milestone_message(tmp_path):
    tracker = make_tracker(tmp_path)
    base = datetime(2024, 1, 1, tzinfo=ZoneInfo("UTC"))

    last_result: RecordResult | None = None
    for offset in range(7):
        last_result = tracker.record_message(
            "C1", "U1", (base + timedelta(days=offset)).timestamp()
        )

    assert last_result is not None
    assert last_result.milestone_message is not None
    assert "1 week" in last_result.milestone_message
