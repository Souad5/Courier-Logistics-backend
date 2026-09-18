-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ParcelStatus" ADD VALUE 'DELIVERY_FAILED';
ALTER TYPE "ParcelStatus" ADD VALUE 'RETURN_TO_SENDER';
ALTER TYPE "ParcelStatus" ADD VALUE 'RETURNED';

-- AlterTable
ALTER TABLE "Parcel" ADD COLUMN     "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "returnedAt" TIMESTAMP(3);

