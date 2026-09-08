import type { JsonValue } from "@prisma/client/runtime/library";

import { prisma } from "../config/prisma";

export interface AuditLogInput {
  action:
    | "CREATED"
    | "UPDATED"
    | "STATUS_CHANGED"
    | "ROLE_CHANGED"
    | "DELETED"
    | "LOGIN"
    | "LOGOUT"
    | "PAYMENT"
    | "ASSIGNMENT";
  actorId?: string;
  entityType: string;
  entityId?: string;
  oldValue?: JsonValue;
  newValue?: JsonValue;
  metadata?: JsonValue;
  ipAddress?: string;
  userAgent?: string;
}

export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  const {
    action,
    actorId,
    entityType,
    entityId,
    oldValue,
    newValue,
    metadata,
    ipAddress,
    userAgent,
  } = input;

  await prisma.auditLog.create({
    data: {
      action,
      actorId,
      entityType,
      entityId,
      oldValue: (oldValue as JsonValue) ?? undefined,
      newValue: (newValue as JsonValue) ?? undefined,
      metadata: (metadata as JsonValue) ?? undefined,
      ipAddress,
      userAgent,
    },
  });
}
