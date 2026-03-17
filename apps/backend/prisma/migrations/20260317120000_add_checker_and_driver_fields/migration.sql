-- AlterTable orders: add checker/driver fields
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "driver_note" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "checker_note" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "sent_to_checker" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable order_lines: add checker inspection fields
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "checked_by_inspector" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "checked_at" TIMESTAMP(3);
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "checker_note" TEXT;

-- AlterTable routes: add is_optimized
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "is_optimized" BOOLEAN NOT NULL DEFAULT false;
