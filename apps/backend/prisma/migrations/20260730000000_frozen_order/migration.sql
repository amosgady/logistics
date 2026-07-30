ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'FROZEN';

CREATE TABLE IF NOT EXISTS "frozen_orders" (
  "id"           SERIAL PRIMARY KEY,
  "frozen_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "order_number" TEXT NOT NULL,
  "frozen_by"    TEXT,
  "success"      BOOLEAN NOT NULL,
  "error"        TEXT
);

CREATE INDEX IF NOT EXISTS "frozen_orders_frozen_at_idx" ON "frozen_orders"("frozen_at");
