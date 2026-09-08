import type { AuditAction, Prisma } from "@prisma/client";
import type { Request } from "express";

import { prisma } from "../../config";

export interface IAuditInput {
  action: AuditAction;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  oldValue?: Prisma.JsonValue;
  newValue?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
  req?: Request;
  tx?: Prisma.TransactionClient;
}

export async function logAudit(input: IAuditInput): Promise<void> {
  const { action, actorId, entityType, entityId, oldValue, newValue, metadata, req, tx } = input;
  const client = tx ?? prisma;

  await client.auditLog.create({
    data: {
      action,
      actorId,
      entityType,
      entityId,
      oldValue: oldValue ?? undefined,
      newValue: newValue ?? undefined,
      metadata: metadata ?? undefined,
      ipAddress: req?.ip,
      userAgent: req?.get("user-agent") ?? undefined,
    },
  });
}
