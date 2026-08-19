PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO plans (id, name, price, credits, active) VALUES ('free', 'FREE', 0, 1, 1);
UPDATE plans SET name='FREE', price=0, credits=1, active=1 WHERE id='free';
UPDATE plans SET credits=10, active=1 WHERE id='starter';
UPDATE plans SET credits=50, active=1 WHERE id='growth';
UPDATE plans SET credits=200, active=1 WHERE id='pro';

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT,
  provider_subscription_id TEXT UNIQUE,
  provider_price_id TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(plan_id) REFERENCES plans(id)
);
CREATE INDEX IF NOT EXISTS subscriptions_provider_idx ON subscriptions(provider, provider_subscription_id);
INSERT OR IGNORE INTO subscriptions (user_id, plan_id, status, updated_at)
SELECT id, 'free', 'ACTIVE', created_at FROM users;

CREATE TABLE IF NOT EXISTS analysis_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  analysis_id TEXT UNIQUE,
  plan_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('RESERVED','COMPLETED')),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(analysis_id) REFERENCES analyses(id),
  FOREIGN KEY(plan_id) REFERENCES plans(id)
);
CREATE INDEX IF NOT EXISTS analysis_usage_limit_idx ON analysis_usage(user_id, period_key, status);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

ALTER TABLE payments ADD COLUMN provider_subscription_id TEXT;
ALTER TABLE payments ADD COLUMN billing_period_start TEXT;
ALTER TABLE payments ADD COLUMN billing_period_end TEXT;
CREATE INDEX IF NOT EXISTS payments_subscription_idx ON payments(provider, provider_subscription_id);
