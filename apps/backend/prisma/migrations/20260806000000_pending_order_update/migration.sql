CREATE TABLE IF NOT EXISTS "pending_order_updates" (
  "id" SERIAL PRIMARY KEY,
  "order_number" TEXT NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "raw_payload" JSONB NOT NULL,
  "diff" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "pending_order_updates_order_number_idx" ON "pending_order_updates"("order_number");
CREATE INDEX IF NOT EXISTS "pending_order_updates_status_idx" ON "pending_order_updates"("status");
