CREATE TABLE IF NOT EXISTS reminder_subscriptions (
  endpoint TEXT PRIMARY KEY NOT NULL,
  subscription_json TEXT NOT NULL,
  collection_date TEXT NOT NULL,
  following_date TEXT NOT NULL,
  collection_type TEXT NOT NULL CHECK (collection_type IN ('red', 'yellow')),
  lead_days INTEGER NOT NULL CHECK (lead_days IN (0, 1, 2, 7)),
  local_time TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  claim_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS reminder_subscriptions_due_idx
  ON reminder_subscriptions (scheduled_at, claim_until);

CREATE INDEX IF NOT EXISTS reminder_subscriptions_updated_idx
  ON reminder_subscriptions (updated_at);
