ALTER TABLE payments ADD COLUMN provider TEXT NOT NULL DEFAULT 'toss';
ALTER TABLE payments ADD COLUMN provider_price_id TEXT;
CREATE INDEX IF NOT EXISTS payments_provider_id_idx ON payments(provider, provider_payment_id);
