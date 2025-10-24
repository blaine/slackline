-- Channels being monitored
CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_channel_id TEXT NOT NULL UNIQUE,
    channel_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Users who have posted
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_user_id TEXT NOT NULL UNIQUE,
    slack_timezone TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Streak data per user per channel
CREATE TABLE IF NOT EXISTS streaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    current_streak INTEGER NOT NULL DEFAULT 0,
    last_post_date TEXT,
    total_checkins INTEGER NOT NULL DEFAULT 0,
    streak_start_date TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (channel_id) REFERENCES channels(id),
    UNIQUE(user_id, channel_id)
);

-- Days off configuration
CREATE TABLE IF NOT EXISTS days_off (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    day_type TEXT NOT NULL CHECK(day_type IN ('recurring_weekly', 'date_range')),
    day_value INTEGER,
    start_date TEXT,
    end_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_slack_user_id ON users(slack_user_id);
CREATE INDEX IF NOT EXISTS idx_channels_slack_channel_id ON channels(slack_channel_id);
CREATE INDEX IF NOT EXISTS idx_streaks_user_channel ON streaks(user_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_days_off_user_id ON days_off(user_id);
