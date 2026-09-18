-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'PARCEL_PROOF_OF_DELIVERY_UPLOADED';

-- AlterTable
ALTER TABLE "Parcel" ADD COLUMN     "proofOfDeliveryUrl" TEXT;

