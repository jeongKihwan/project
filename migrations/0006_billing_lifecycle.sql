PRAGMA foreign_keys = ON;

ALTER TABLE subscriptions ADD COLUMN pending_plan_id TEXT;
ALTER TABLE subscriptions ADD COLUMN pending_action TEXT;
ALTER TABLE subscriptions ADD COLUMN pending_action_at TEXT;

CREATE TABLE IF NOT EXISTS refund_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  payment_id TEXT NOT NULL UNIQUE,
  provider_adjustment_id TEXT UNIQUE,
  provider_transaction_id TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(payment_id) REFERENCES payments(id)
);
CREATE INDEX IF NOT EXISTS refund_requests_user_idx ON refund_requests(user_id, requested_at);
