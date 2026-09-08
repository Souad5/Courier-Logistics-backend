import type { AuditAction, ParcelStatus } from "@prisma/client";

export interface IDashboardStats {
  totalIncome: number;
  totalCustomers: number;
  totalCouriers: number;
  activeCouriers: number;
  totalParcels: number;
  deliveredParcels: number;
  pendingParcels: number;
  cancelledParcels: number;
  statusBreakdown: Array<{ status: ParcelStatus; count: number }>;
}

export interface IAuditEntry {
  id: string;
  action: AuditAction;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  oldValue: unknown;
  newValue: unknown;
  metadata: unknown;
  createdAt: Date;
  actor: { id: string; name: string; email: string } | null;
}
