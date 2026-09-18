import {
  type Parcel,
  ParcelStatus,
  type ParcelStatusHistory,
  type Prisma,
  Role,
} from "@prisma/client";
import type { Request } from "express";

import { prisma } from "../../../config";
import { uploadToCloudinary } from "../../../config/cloudinary";
import { cacheDelete, cacheGet, cacheSet } from "../../../config/redis";
import { type IPaginationMeta, QueryBuilder } from "../../builder/QueryBuilder";
import { AppError } from "../../errors/AppError";
import { logAudit } from "../../utils/audit";
import { calculateFee, generateTrackingNumber } from "./parcel.constant";
import type {
  IAssignParcelInput,
  ICreateParcelInput,
  IParcelStatusHistoryPayload,
  IParcelTrackingPayload,
  IUpdateParcelStatusInput,
} from "./parcel.interface";

const PARCEL_INCLUDE = {
  sender: { select: { id: true, name: true, email: true, phone: true } },
  courier: { select: { id: true, name: true, email: true, phone: true } },
  originHub: { select: { id: true, name: true, code: true, zoneCode: true, zoneName: true } },
  destinationHub: { select: { id: true, name: true, code: true, zoneCode: true, zoneName: true } },
  payment: { select: { id: true, status: true, amount: true, paidAt: true } },
} satisfies Prisma.ParcelInclude;

type ParcelWithRelations = Prisma.ParcelGetPayload<{ include: typeof PARCEL_INCLUDE }>;

export const TERMINAL_STATUSES: ParcelStatus[] = [
  ParcelStatus.DELIVERED,
  ParcelStatus.CANCELLED,
  ParcelStatus.RETURNED,
];

export const MAX_DELIVERY_ATTEMPTS = 3;

/**
 * Centralized parcel state machine. `PENDING -> ACCEPTED` is deliberately absent
 * here: that transition only happens via courier assignment or the payment
 * webhook (both apply it directly in their own transaction), never through the
 * generic status-update endpoint, so payment/assignment can't be bypassed.
 */
export const ALLOWED_TRANSITIONS: Record<ParcelStatus, ParcelStatus[]> = {
  [ParcelStatus.PENDING]: [ParcelStatus.CANCELLED],
  [ParcelStatus.ACCEPTED]: [ParcelStatus.PICKED_UP, ParcelStatus.CANCELLED],
  [ParcelStatus.PICKED_UP]: [ParcelStatus.IN_TRANSIT, ParcelStatus.CANCELLED],
  [ParcelStatus.IN_TRANSIT]: [ParcelStatus.OUT_FOR_DELIVERY, ParcelStatus.CANCELLED],
  [ParcelStatus.OUT_FOR_DELIVERY]: [ParcelStatus.DELIVERED, ParcelStatus.DELIVERY_FAILED],
  [ParcelStatus.DELIVERY_FAILED]: [ParcelStatus.OUT_FOR_DELIVERY, ParcelStatus.RETURN_TO_SENDER],
  [ParcelStatus.RETURN_TO_SENDER]: [ParcelStatus.RETURNED],
  [ParcelStatus.DELIVERED]: [],
  [ParcelStatus.RETURNED]: [],
  [ParcelStatus.CANCELLED]: [],
};

/**
 * Pure transition check used by both the service and unit tests. Layers the
 * delivery-attempt cap on top of the static adjacency table: once a parcel has
 * failed delivery `MAX_DELIVERY_ATTEMPTS` times, it may no longer go back
 * OUT_FOR_DELIVERY — it must be returned to the sender instead.
 */
export function assertValidTransition(
  currentStatus: ParcelStatus,
  nextStatus: ParcelStatus,
  deliveryAttempts: number,
): void {
  if (nextStatus === currentStatus) {
    throw new AppError(400, `Parcel is already in ${nextStatus} status.`);
  }
  if (!ALLOWED_TRANSITIONS[currentStatus].includes(nextStatus)) {
    throw new AppError(400, `Invalid transition from ${currentStatus} to ${nextStatus}.`);
  }
  if (
    currentStatus === ParcelStatus.DELIVERY_FAILED &&
    nextStatus === ParcelStatus.OUT_FOR_DELIVERY &&
    deliveryAttempts >= MAX_DELIVERY_ATTEMPTS
  ) {
    throw new AppError(
      409,
      `Maximum delivery attempts (${MAX_DELIVERY_ATTEMPTS}) reached. This parcel must be returned to the sender.`,
    );
  }
}

export async function createParcel(
  senderId: string,
  input: ICreateParcelInput,
  req?: Request,
): Promise<ParcelWithRelations> {
  if (input.originHubId === input.destinationHubId) {
    throw new AppError(400, "Origin and destination hubs must be different.");
  }

  const [originHub, destinationHub] = await Promise.all([
    prisma.hub.findUnique({ where: { id: input.originHubId, isDeleted: false } }),
    prisma.hub.findUnique({ where: { id: input.destinationHubId, isDeleted: false } }),
  ]);

  if (!originHub) throw new AppError(404, "Origin hub not found.");
  if (!destinationHub) throw new AppError(404, "Destination hub not found.");

  const fee = calculateFee(input.weightKg, originHub.zoneCode, destinationHub.zoneCode);
  const trackingNumber = generateTrackingNumber();

  return prisma.$transaction(
    async (tx) => {
      const parcel = await tx.parcel.create({
        data: {
          trackingNumber,
          type: input.type,
          weightKg: input.weightKg,
          dimensions: input.dimensions,
          fee: fee.total,
          currency: fee.currency,
          senderId,
          originHubId: input.originHubId,
          destinationHubId: input.destinationHubId,
          senderName: input.senderName.trim(),
          senderPhone: input.senderPhone.trim(),
          senderAddress: input.senderAddress.trim(),
          senderCity: input.senderCity,
          receiverName: input.receiverName.trim(),
          receiverPhone: input.receiverPhone.trim(),
          receiverAddress: input.receiverAddress.trim(),
          receiverCity: input.receiverCity,
          notes: input.notes,
        },
        include: PARCEL_INCLUDE,
      });

      await tx.parcelStatusHistory.create({
        data: {
          parcelId: parcel.id,
          status: ParcelStatus.PENDING,
          note: "Parcel created, awaiting payment.",
        },
      });

      await logAudit({
        action: "PARCEL_CREATED",
        actorId: senderId,
        entityType: "Parcel",
        entityId: parcel.id,
        newValue: { trackingNumber: parcel.trackingNumber, fee: fee.total, status: parcel.status },
        metadata: {
          feeBreakdown: {
            total: fee.total,
            baseFee: fee.baseFee,
            weightFee: fee.weightFee,
            zoneSurcharge: fee.zoneSurcharge,
            currency: fee.currency,
          },
        },
        tx,
        req,
      });

      return parcel;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}

export async function listParcels(
  query: Record<string, unknown>,
): Promise<{ parcels: ParcelWithRelations[]; meta: IPaginationMeta }> {
  const queryBuilder = new QueryBuilder(query, {
    sortBy: "createdAt",
    searchableFields: ["trackingNumber", "receiverName", "receiverPhone", "senderName"],
    sortableFields: ["createdAt", "fee", "weightKg", "status"],
  });

  const where = queryBuilder
    .filter("status", query.status ? String(query.status) : undefined)
    .filter("type", query.type ? String(query.type) : undefined)
    .filter("courierId", query.courierId ? String(query.courierId) : undefined)
    .filter("senderId", query.senderId ? String(query.senderId) : undefined)
    .filter("originHubId", query.originHubId ? String(query.originHubId) : undefined)
    .filter("destinationHubId", query.destinationHubId ? String(query.destinationHubId) : undefined)
    .where();

  const [parcels, total] = await prisma.$transaction([
    prisma.parcel.findMany({
      where,
      include: PARCEL_INCLUDE,
      orderBy: queryBuilder.orderBy() as Prisma.ParcelOrderByWithRelationInput,
      ...queryBuilder.pagination(),
    }),
    prisma.parcel.count({ where }),
  ]);

  return { parcels, meta: queryBuilder.buildMeta(total) };
}

export async function listMyParcels(
  userId: string,
  role: Role,
  query: Record<string, unknown>,
): Promise<{ parcels: ParcelWithRelations[]; meta: IPaginationMeta }> {
  const queryBuilder = new QueryBuilder(query, {
    sortBy: "createdAt",
    searchableFields: ["trackingNumber", "receiverName"],
    sortableFields: ["createdAt", "fee", "status"],
  });

  const ownerFilter = role === Role.COURIER ? { courierId: userId } : { senderId: userId };

  const where = queryBuilder
    .filter("status", query.status ? String(query.status) : undefined)
    .where({ ...ownerFilter });

  const [parcels, total] = await prisma.$transaction([
    prisma.parcel.findMany({
      where,
      include: PARCEL_INCLUDE,
      orderBy: queryBuilder.orderBy() as Prisma.ParcelOrderByWithRelationInput,
      ...queryBuilder.pagination(),
    }),
    prisma.parcel.count({ where }),
  ]);

  return { parcels, meta: queryBuilder.buildMeta(total) };
}

export async function getParcelById(
  parcelId: string,
  actor: { id: string; role: Role },
): Promise<ParcelWithRelations> {
  const parcel = await prisma.parcel.findUnique({
    where: { id: parcelId, isDeleted: false },
    include: PARCEL_INCLUDE,
  });

  if (!parcel) throw new AppError(404, "Parcel not found.");

  const isOwner = parcel.senderId === actor.id || parcel.courierId === actor.id;
  if (actor.role !== Role.ADMIN && !isOwner) {
    throw new AppError(403, "You do not have access to this parcel.");
  }

  return parcel;
}

// Public tracking is hit repeatedly by senders/receivers polling for updates.
// A short TTL keeps it cheap on the DB without risking meaningfully stale reads,
// and every write path that can change a parcel's status/visibility (status
// updates, payment webhook, soft delete) actively evicts this key on commit.
const TRACKING_CACHE_TTL_SECONDS = 20;
export const trackingCacheKey = (trackingNumber: string): string =>
  `parcel:track:${trackingNumber}`;

export async function trackParcel(trackingNumber: string): Promise<IParcelTrackingPayload> {
  const cacheKey = trackingCacheKey(trackingNumber);
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached) as IParcelTrackingPayload;

  const parcel = await prisma.parcel.findUnique({
    where: { trackingNumber, isDeleted: false },
    include: {
      statusHistory: { orderBy: { createdAt: "desc" as const }, take: 10 },
    },
  });

  if (!parcel) throw new AppError(404, "No parcel found for this tracking number.");

  const history: IParcelStatusHistoryPayload[] = parcel.statusHistory.map(
    (entry: ParcelStatusHistory) => ({
      id: entry.id,
      status: entry.status,
      fromStatus: entry.fromStatus,
      location: entry.location,
      note: entry.note,
      createdAt: entry.createdAt,
    }),
  );

  const payload: IParcelTrackingPayload = {
    trackingNumber: parcel.trackingNumber,
    status: parcel.status,
    type: parcel.type,
    fee: parcel.fee,
    currency: parcel.currency,
    senderCity: parcel.senderCity,
    receiverName: parcel.receiverName,
    receiverCity: parcel.receiverCity,
    createdAt: parcel.createdAt,
    deliveredAt: parcel.deliveredAt,
    deliveryAttempts: parcel.deliveryAttempts,
    proofOfDeliveryUrl: parcel.proofOfDeliveryUrl,
    history,
  };

  await cacheSet(cacheKey, JSON.stringify(payload), TRACKING_CACHE_TTL_SECONDS);

  return payload;
}

export async function assignParcelToCourier(
  parcelId: string,
  input: IAssignParcelInput,
  adminId: string,
): Promise<ParcelWithRelations> {
  const [parcel, courier] = await Promise.all([
    prisma.parcel.findUnique({ where: { id: parcelId, isDeleted: false } }),
    prisma.user.findUnique({ where: { id: input.courierId, isDeleted: false } }),
  ]);

  if (!parcel) throw new AppError(404, "Parcel not found.");
  if (!courier) throw new AppError(404, "Courier not found.");
  if (courier.role !== Role.COURIER) throw new AppError(400, "Assigned user is not a courier.");
  if (courier.status !== "ACTIVE") {
    throw new AppError(409, "This courier's account is not active.");
  }
  if (!courier.isAvailable) {
    throw new AppError(409, "This courier is not currently available for new assignments.");
  }
  if (TERMINAL_STATUSES.includes(parcel.status)) {
    throw new AppError(409, "Cannot assign a courier to a terminal parcel.");
  }
  if (input.destinationHubId) {
    const destHub = await prisma.hub.findUnique({
      where: { id: input.destinationHubId, isDeleted: false },
    });
    if (!destHub) throw new AppError(404, "Destination hub not found.");
  }

  return prisma.$transaction(
    async (tx) => {
      const updated = await tx.parcel.update({
        where: { id: parcelId },
        data: {
          courierId: input.courierId,
          ...(input.destinationHubId ? { destinationHubId: input.destinationHubId } : {}),
          status: parcel.status === ParcelStatus.PENDING ? ParcelStatus.ACCEPTED : parcel.status,
        },
        include: PARCEL_INCLUDE,
      });

      if (parcel.status === ParcelStatus.PENDING) {
        await tx.parcelStatusHistory.create({
          data: {
            parcelId,
            status: ParcelStatus.ACCEPTED,
            fromStatus: ParcelStatus.PENDING,
            note: "Courier assigned and parcel accepted for shipping.",
          },
        });
      }

      await logAudit({
        action: "PARCEL_ASSIGNED",
        actorId: adminId,
        entityType: "Parcel",
        entityId: parcelId,
        oldValue: { courierId: parcel.courierId },
        newValue: { courierId: input.courierId, destinationHubId: input.destinationHubId },
        tx,
      });

      return updated;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}

export async function updateParcelStatus(
  parcelId: string,
  actor: { id: string; role: Role },
  input: IUpdateParcelStatusInput,
): Promise<Parcel> {
  const parcel = await prisma.parcel.findUnique({
    where: { id: parcelId, isDeleted: false },
    select: {
      id: true,
      status: true,
      courierId: true,
      deliveredAt: true,
      deliveryAttempts: true,
      trackingNumber: true,
    },
  });

  if (!parcel) throw new AppError(404, "Parcel not found.");

  if (actor.role === Role.COURIER && parcel.courierId !== actor.id) {
    throw new AppError(403, "This parcel is not assigned to you.");
  }

  const nextStatus = input.status;
  assertValidTransition(parcel.status, nextStatus, parcel.deliveryAttempts);

  if (nextStatus === ParcelStatus.DELIVERY_FAILED && !input.note) {
    throw new AppError(400, "A reason is required when recording a failed delivery attempt.");
  }

  const updated = await prisma.$transaction(
    async (tx) => {
      const result = await tx.parcel.update({
        where: { id: parcelId },
        data: {
          status: nextStatus,
          ...(nextStatus === ParcelStatus.DELIVERED ? { deliveredAt: new Date() } : {}),
          ...(nextStatus === ParcelStatus.CANCELLED ? { cancelledAt: new Date() } : {}),
          ...(nextStatus === ParcelStatus.RETURNED ? { returnedAt: new Date() } : {}),
          ...(nextStatus === ParcelStatus.DELIVERY_FAILED
            ? { deliveryAttempts: { increment: 1 } }
            : {}),
        },
      });

      await tx.parcelStatusHistory.create({
        data: {
          parcelId,
          status: nextStatus,
          fromStatus: parcel.status,
          location: input.location,
          note: input.note,
          changedById: actor.id,
        },
      });

      await logAudit({
        action: "PARCEL_STATUS_CHANGED",
        actorId: actor.id,
        entityType: "Parcel",
        entityId: parcelId,
        oldValue: { status: parcel.status },
        newValue: { status: nextStatus, location: input.location, note: input.note },
        tx,
      });

      return result;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );

  await cacheDelete(trackingCacheKey(parcel.trackingNumber));

  return updated;
}

export async function softDeleteParcel(
  parcelId: string,
  actor: { id: string; role: Role },
): Promise<void> {
  const parcel = await prisma.parcel.findUnique({
    where: { id: parcelId, isDeleted: false },
    select: { id: true, status: true, senderId: true, trackingNumber: true },
  });

  if (!parcel) throw new AppError(404, "Parcel not found.");

  const isSender = actor.role === Role.CUSTOMER && parcel.senderId === actor.id;
  if (actor.role !== Role.ADMIN && !isSender) {
    throw new AppError(403, "Only the sender or an admin may delete this parcel.");
  }
  if (actor.role !== Role.ADMIN && parcel.status !== ParcelStatus.PENDING) {
    throw new AppError(409, "Only pending parcels can be deleted by the sender.");
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.parcel.update({ where: { id: parcelId }, data: { isDeleted: true } });

      await logAudit({
        action: "PARCEL_DELETED",
        actorId: actor.id,
        entityType: "Parcel",
        entityId: parcelId,
        oldValue: { status: parcel.status },
        tx,
      });
    },
    { maxWait: 10_000, timeout: 20_000 },
  );

  await cacheDelete(trackingCacheKey(parcel.trackingNumber));
}

const PROOF_UPLOADABLE_STATUSES: ParcelStatus[] = [
  ParcelStatus.OUT_FOR_DELIVERY,
  ParcelStatus.DELIVERED,
];

export async function uploadParcelProofOfDelivery(
  parcelId: string,
  actor: { id: string; role: Role },
  file: Express.Multer.File,
): Promise<ParcelWithRelations> {
  const parcel = await prisma.parcel.findUnique({
    where: { id: parcelId, isDeleted: false },
    select: { id: true, status: true, courierId: true, trackingNumber: true },
  });

  if (!parcel) throw new AppError(404, "Parcel not found.");

  if (actor.role === Role.COURIER && parcel.courierId !== actor.id) {
    throw new AppError(403, "This parcel is not assigned to you.");
  }

  if (!PROOF_UPLOADABLE_STATUSES.includes(parcel.status)) {
    throw new AppError(
      409,
      "Proof of delivery can only be attached while a parcel is out for delivery or delivered.",
    );
  }

  const url = await uploadToCloudinary(file, "courier/proof-of-delivery");

  const updated = await prisma.parcel.update({
    where: { id: parcelId },
    data: { proofOfDeliveryUrl: url },
    include: PARCEL_INCLUDE,
  });

  await logAudit({
    action: "PARCEL_PROOF_OF_DELIVERY_UPLOADED",
    actorId: actor.id,
    entityType: "Parcel",
    entityId: parcelId,
    newValue: { proofOfDeliveryUrl: url },
  });

  await cacheDelete(trackingCacheKey(parcel.trackingNumber));

  return updated;
}
