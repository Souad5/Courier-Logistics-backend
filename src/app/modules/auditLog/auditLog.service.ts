import { PaymentStatus, type Prisma, Role } from "@prisma/client";

import { prisma } from "../../../config";
import { type IPaginationMeta, QueryBuilder } from "../../builder/QueryBuilder";
import type { IAuditEntry, IDashboardStats } from "./auditLog.interface";

const ALLOWED_PERIOD_DAYS = [7, 30, 90, 365];
const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

async function getPeriodStats(rawDays: number): Promise<IDashboardStats["period"]> {
  const days = ALLOWED_PERIOD_DAYS.includes(rawDays) ? rawDays : 30;
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const from = new Date(startOfToday.getTime() - (days - 1) * DAY_MS);
  const previousFrom = new Date(from.getTime() - days * DAY_MS);

  const [parcels, payments, previousParcels, previousPayments] = await Promise.all([
    prisma.parcel.findMany({
      where: { isDeleted: false, createdAt: { gte: from } },
      select: { createdAt: true, status: true },
    }),
    prisma.payment.findMany({
      where: { isDeleted: false, status: PaymentStatus.PAID, paidAt: { gte: from } },
      select: { paidAt: true, amount: true },
    }),
    prisma.parcel.findMany({
      where: { isDeleted: false, createdAt: { gte: previousFrom, lt: from } },
      select: { status: true },
    }),
    prisma.payment.aggregate({
      where: {
        isDeleted: false,
        status: PaymentStatus.PAID,
        paidAt: { gte: previousFrom, lt: from },
      },
      _sum: { amount: true },
    }),
  ]);

  const buckets = new Map<string, { parcels: number; delivered: number; revenue: number }>();
  for (let i = 0; i < days; i++) {
    buckets.set(dayKey(new Date(from.getTime() + i * DAY_MS)), {
      parcels: 0,
      delivered: 0,
      revenue: 0,
    });
  }
  for (const parcel of parcels) {
    const bucket = buckets.get(dayKey(parcel.createdAt));
    if (!bucket) continue;
    bucket.parcels += 1;
    if (parcel.status === "DELIVERED") bucket.delivered += 1;
  }
  let revenue = 0;
  for (const payment of payments) {
    if (!payment.paidAt) continue;
    const amount = Number(payment.amount);
    revenue += amount;
    const bucket = buckets.get(dayKey(payment.paidAt));
    if (bucket) bucket.revenue += amount;
  }

  return {
    days,
    from: from.toISOString(),
    parcels: parcels.length,
    revenue,
    delivered: parcels.filter((p) => p.status === "DELIVERED").length,
    previousParcels: previousParcels.length,
    previousRevenue: previousPayments._sum.amount ? Number(previousPayments._sum.amount) : 0,
    previousDelivered: previousParcels.filter((p) => p.status === "DELIVERED").length,
    timeline: Array.from(buckets.entries()).map(([date, values]) => ({ date, ...values })),
  };
}

export async function getDashboardStats(days = 30): Promise<IDashboardStats> {
  const [
    incomeAgg,
    totalCustomers,
    totalCouriers,
    activeCouriers,
    totalParcels,
    statusBreakdown,
    deliveryAttemptsAgg,
    period,
  ] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: PaymentStatus.PAID, isDeleted: false },
      _sum: { amount: true },
    }),
    prisma.user.count({ where: { role: Role.CUSTOMER, isDeleted: false } }),
    prisma.user.count({ where: { role: Role.COURIER, isDeleted: false } }),
    prisma.user.count({ where: { role: Role.COURIER, status: "ACTIVE", isDeleted: false } }),
    prisma.parcel.count({ where: { isDeleted: false } }),
    prisma.parcel.groupBy({
      by: ["status"],
      where: { isDeleted: false },
      _count: { _all: true },
    }),
    prisma.parcel.aggregate({
      where: { isDeleted: false },
      _sum: { deliveryAttempts: true },
    }),
    getPeriodStats(days),
  ]);

  const breakdown = statusBreakdown.map((row) => ({
    status: row.status,
    count: row._count._all,
  }));

  return {
    totalIncome: incomeAgg._sum.amount ? Number(incomeAgg._sum.amount) : 0,
    totalCustomers,
    totalCouriers,
    activeCouriers,
    totalParcels,
    deliveredParcels: breakdown.find((b) => b.status === "DELIVERED")?.count ?? 0,
    pendingParcels: breakdown.find((b) => b.status === "PENDING")?.count ?? 0,
    cancelledParcels: breakdown.find((b) => b.status === "CANCELLED")?.count ?? 0,
    returnedParcels: breakdown.find((b) => b.status === "RETURNED")?.count ?? 0,
    totalFailedDeliveryAttempts: deliveryAttemptsAgg._sum.deliveryAttempts ?? 0,
    statusBreakdown: breakdown,
    period,
  };
}

export async function listAuditLogs(
  query: Record<string, unknown>,
): Promise<{ logs: IAuditEntry[]; meta: IPaginationMeta }> {
  const queryBuilder = new QueryBuilder(query, {
    sortBy: "createdAt",
    sortableFields: ["createdAt"],
    softDelete: false,
  });

  const where = queryBuilder
    .filter("action", query.action ? String(query.action) : undefined)
    .filter("entityType", query.entityType ? String(query.entityType) : undefined)
    .filter("entityId", query.entityId ? String(query.entityId) : undefined)
    .where();

  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
      orderBy: queryBuilder.orderBy() as Prisma.AuditLogOrderByWithRelationInput,
      ...queryBuilder.pagination(),
    }),
    prisma.auditLog.count({ where }),
  ]);

  const entries: IAuditEntry[] = logs.map((log) => ({
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    oldValue: log.oldValue,
    newValue: log.newValue,
    metadata: log.metadata,
    createdAt: log.createdAt,
    actor: log.actor ? { id: log.actor.id, name: log.actor.name, email: log.actor.email } : null,
  }));

  return { logs: entries, meta: queryBuilder.buildMeta(total) };
}
