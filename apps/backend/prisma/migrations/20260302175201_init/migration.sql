-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'COORDINATOR', 'DRIVER', 'INSTALLER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PLANNING', 'APPROVED', 'SENT_TO_DRIVER', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('DELIVERY', 'INSTALLATION', 'DELIVERY_AND_INSTALLATION');

-- CreateEnum
CREATE TYPE "TruckSize" AS ENUM ('SMALL', 'LARGE');

-- CreateEnum
CREATE TYPE "TimeWindow" AS ENUM ('MORNING', 'AFTERNOON');

-- CreateEnum
CREATE TYPE "DeliveryResult" AS ENUM ('COMPLETE', 'PARTIAL', 'NOT_DELIVERED');

-- CreateEnum
CREATE TYPE "CoordinationStatus" AS ENUM ('NOT_STARTED', 'COORDINATED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_profiles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "license_type" TEXT NOT NULL,

    CONSTRAINT "driver_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installer_profiles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "zone_id" INTEGER,

    CONSTRAINT "installer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "name_he" TEXT NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_cities" (
    "id" SERIAL NOT NULL,
    "zone_id" INTEGER NOT NULL,
    "city" TEXT NOT NULL,

    CONSTRAINT "zone_cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "order_number" TEXT NOT NULL,
    "order_date" TIMESTAMP(3) NOT NULL,
    "delivery_date" TIMESTAMP(3) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "customer_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "contact_person" TEXT,
    "delivery_type" "DeliveryType" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geocode_valid" BOOLEAN,
    "zone_id" INTEGER,
    "zone_override" BOOLEAN NOT NULL DEFAULT false,
    "route_id" INTEGER,
    "route_sequence" INTEGER,
    "time_window" "TimeWindow",
    "estimated_arrival" TIMESTAMP(3),
    "wait_time_minutes" INTEGER,
    "coordination_status" "CoordinationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "coordination_notes" TEXT,
    "sent_to_driver" BOOLEAN NOT NULL DEFAULT false,
    "exported_to_csv" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "line_number" INTEGER NOT NULL,
    "product" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "weight" DECIMAL(10,2) NOT NULL,
    "current_stock" INTEGER NOT NULL,
    "pallet_count" INTEGER NOT NULL DEFAULT 1,
    "barcode" TEXT,
    "scanned_load" BOOLEAN NOT NULL DEFAULT false,
    "scanned_deliver" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trucks" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "license_plate" TEXT NOT NULL,
    "size" "TruckSize" NOT NULL,
    "has_crane" BOOLEAN NOT NULL DEFAULT false,
    "max_weight_kg" DECIMAL(10,2) NOT NULL,
    "max_pallets" INTEGER NOT NULL,
    "work_hours_per_day" DECIMAL(4,2) NOT NULL,
    "wait_time_per_stop" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "trucks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "truck_assignments" (
    "id" SERIAL NOT NULL,
    "truck_id" INTEGER NOT NULL,
    "driver_profile_id" INTEGER NOT NULL,
    "assignment_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "truck_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installer_assignments" (
    "id" SERIAL NOT NULL,
    "installer_profile_id" INTEGER NOT NULL,
    "order_id" INTEGER NOT NULL,
    "assignment_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installer_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" SERIAL NOT NULL,
    "truck_id" INTEGER NOT NULL,
    "route_date" TIMESTAMP(3) NOT NULL,
    "total_distance_km" DECIMAL(10,2),
    "total_time_minutes" INTEGER,
    "overtime_approved" BOOLEAN NOT NULL DEFAULT false,
    "is_finalized" BOOLEAN NOT NULL DEFAULT false,
    "coordinator_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "result" "DeliveryResult" NOT NULL,
    "notes" TEXT,
    "signature_url" TEXT,
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_photos" (
    "id" SERIAL NOT NULL,
    "delivery_id" INTEGER NOT NULL,
    "photo_url" TEXT NOT NULL,

    CONSTRAINT "delivery_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_locations" (
    "id" SERIAL NOT NULL,
    "driver_profile_id" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "from_status" "OrderStatus" NOT NULL,
    "to_status" "OrderStatus" NOT NULL,
    "changed_by" INTEGER NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "driver_profiles_user_id_key" ON "driver_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "installer_profiles_user_id_key" ON "installer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "zones_name_key" ON "zones"("name");

-- CreateIndex
CREATE UNIQUE INDEX "zone_cities_zone_id_city_key" ON "zone_cities"("zone_id", "city");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_delivery_date_idx" ON "orders"("delivery_date");

-- CreateIndex
CREATE INDEX "orders_zone_id_idx" ON "orders"("zone_id");

-- CreateIndex
CREATE INDEX "orders_route_id_idx" ON "orders"("route_id");

-- CreateIndex
CREATE UNIQUE INDEX "trucks_name_key" ON "trucks"("name");

-- CreateIndex
CREATE UNIQUE INDEX "trucks_license_plate_key" ON "trucks"("license_plate");

-- CreateIndex
CREATE UNIQUE INDEX "truck_assignments_truck_id_assignment_date_key" ON "truck_assignments"("truck_id", "assignment_date");

-- CreateIndex
CREATE UNIQUE INDEX "routes_truck_id_route_date_key" ON "routes"("truck_id", "route_date");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_order_id_key" ON "deliveries"("order_id");

-- CreateIndex
CREATE INDEX "driver_locations_driver_profile_id_timestamp_idx" ON "driver_locations"("driver_profile_id", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installer_profiles" ADD CONSTRAINT "installer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installer_profiles" ADD CONSTRAINT "installer_profiles_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_cities" ADD CONSTRAINT "zone_cities_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "truck_assignments" ADD CONSTRAINT "truck_assignments_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "truck_assignments" ADD CONSTRAINT "truck_assignments_driver_profile_id_fkey" FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installer_assignments" ADD CONSTRAINT "installer_assignments_installer_profile_id_fkey" FOREIGN KEY ("installer_profile_id") REFERENCES "installer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_photos" ADD CONSTRAINT "delivery_photos_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driver_profile_id_fkey" FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
