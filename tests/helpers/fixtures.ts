import { randomUUID } from "node:crypto";
import { AuthProvider, type ParcelStatus, type Prisma, Role, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

import { prisma } from "../../src/config";

export const TEST_PASSWORD = "TestPass@123";
export const TEST_TAG = "qa-audit"; // marks every row this suite creates, for easy identification

export function testEmail(label: string): string {
  return `${TEST_TAG}-${label}-${randomUUID().slice(0, 8)}@example.com`;
}

/** Creates a user directly (bypassing the API) so tests can set up ADMIN/COURIER fixtures. */
export async function createTestUser(options: {
  role: Role;
  label: string;
  status?: UserStatus;
  isAvailable?: boolean;
}) {
  const password = await bcrypt.hash(TEST_PASSWORD, 4); // low cost factor — tests only
  const email = testEmail(options.label);

  const user = await prisma.user.create({
    data: {
      email,
      name: `QA ${options.label}`,
      password,
      role: options.role,
      status: options.status ?? UserStatus.ACTIVE,
      provider: AuthProvider.LOCAL,
      isEmailVerified: true,
      isAvailable: options.isAvailable ?? false,
    },
  });

  return { ...user, plainPassword: TEST_PASSWORD };
}

export async function createTestHub(overrides: Partial<Prisma.HubCreateInput> = {}) {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  return prisma.hub.create({
    data: {
      name: `QA Hub ${suffix}`,
      code: `QA-${suffix}`,
      zoneCode: "inner-city",
      zoneName: "Inner City",
      address: "1 Test Street",
      city: "Dhaka",
      ...overrides,
    },
  });
}

export async function createTestParcel(options: {
  senderId: string;
  originHubId: string;
  destinationHubId: string;
  status?: ParcelStatus;
  courierId?: string;
}) {
  return prisma.parcel.create({
    data: {
      trackingNumber: `QA${Date.now()}${randomUUID().slice(0, 4).toUpperCase()}`,
      senderId: options.senderId,
      originHubId: options.originHubId,
      destinationHubId: options.destinationHubId,
      status: options.status,
      courierId: options.courierId,
      weightKg: 2,
      fee: 100,
      senderName: "QA Sender",
      senderPhone: "+8801000000000",
      senderAddress: "1 Test Street",
      receiverName: "QA Receiver",
      receiverPhone: "+8801000000001",
      receiverAddress: "2 Test Street",
    },
  });
}

/**
 * Deletes everything created by the given ids, in dependency order, so the
 * suite leaves the shared dev database exactly as it found it. AuditLog rows
 * are purged explicitly rather than relying on the FK's default ON DELETE
 * behavior for the optional actor/entity relations.
 */
export async function cleanupFixtures(ids: {
  userIds?: string[];
  hubIds?: string[];
  parcelIds?: string[];
}): Promise<void> {
  const userIds = ids.userIds ?? [];
  const hubIds = ids.hubIds ?? [];
  const parcelIds = ids.parcelIds ?? [];

  if (parcelIds.length > 0) {
    await prisma.payment.deleteMany({ where: { parcelId: { in: parcelIds } } });
    await prisma.parcelStatusHistory.deleteMany({ where: { parcelId: { in: parcelIds } } });
  }
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        userIds.length > 0 ? { actorId: { in: userIds } } : undefined,
        parcelIds.length > 0 ? { entityId: { in: parcelIds } } : undefined,
        hubIds.length > 0 ? { entityId: { in: hubIds } } : undefined,
      ].filter((c): c is NonNullable<typeof c> => Boolean(c)),
    },
  });
  if (parcelIds.length > 0) {
    await prisma.parcel.deleteMany({ where: { id: { in: parcelIds } } });
  }
  if (hubIds.length > 0) {
    await prisma.hub.deleteMany({ where: { id: { in: hubIds } } });
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}
