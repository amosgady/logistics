-- CreateEnum
CREATE TYPE "Department" AS ENUM ('GENERAL_TRANSPORT', 'KITCHEN_TRANSPORT', 'INTERIOR_DOOR_TRANSPORT', 'SHOWER_INSTALLATION', 'INTERIOR_DOOR_INSTALLATION', 'KITCHEN_INSTALLATION');

-- AlterTable
ALTER TABLE "installer_profiles" ADD COLUMN     "department" "Department";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "department" "Department";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "department" "Department";

-- CreateIndex
CREATE INDEX "orders_department_idx" ON "orders"("department");
