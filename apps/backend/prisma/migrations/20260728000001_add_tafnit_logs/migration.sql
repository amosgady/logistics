CREATE TABLE "tafnit_logs" (
    "id" SERIAL NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT NOT NULL,
    "order_number" TEXT,
    "raw_body" TEXT NOT NULL,
    "result" JSONB,

    CONSTRAINT "tafnit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tafnit_logs_received_at_idx" ON "tafnit_logs"("received_at");
