import { PaymentStatus, type Prisma, Role } from "@prisma/client";

import { prisma } from "../../../config";
import { type IPaginationMeta, QueryBuilder } from "../../builder/QueryBuilder";
import type { IAuditEntry, IDashboardStats } from "./auditLog.interface";

export async function getDashboardStats(): Promise<IDashboardStats> {
  const [incomeAgg, totalCustomers, totalCouriers, activeCouriers, totalParcels, statusBreakdown] =
    await Promise.all([
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
    statusBreakdown: breakdown,
  };
}

export async function listAuditLogs(
  query: Record<string, unknown>,
): Promise<{ logs: IAuditEntry[]; meta: IPaginationMeta }> {
  const queryBuilder = new QueryBuilder(query, {
    sortBy: "createdAt",
    sortableFields: ["createdAt"],
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
