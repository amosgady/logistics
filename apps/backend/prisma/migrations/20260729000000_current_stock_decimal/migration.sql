ALTER TABLE "order_lines" ALTER COLUMN "current_stock" TYPE DECIMAL(10,2) USING "current_stock"::DECIMAL(10,2);
