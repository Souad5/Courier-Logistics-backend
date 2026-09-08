import { type Prisma, Role } from "@prisma/client";

import { prisma } from "../../../config";
import type { IPaginationMeta } from "../../builder/QueryBuilder";
import { QueryBuilder } from "../../builder/QueryBuilder";
import { AppError } from "../../errors/AppError";
import { logAudit } from "../../utils/audit";
import type { IUpdateProfileInput, IUserPayload } from "./user.interface";

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  avatarUrl: true,
  role: true,
  status: true,
  provider: true,
  isEmailVerified: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type UserSelectPayload = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

function toUserPayload(user: UserSelectPayload): IUserPayload {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function getCurrentUser(userId: string): Promise<IUserPayload> {
  const user = await prisma.user.findUnique({
    where: { id: userId, isDeleted: false },
    select: USER_SELECT,
  });

  if (!user) throw new AppError(404, "User not found.");

  return toUserPayload(user);
}

export async function updateCurrentUser(
  userId: string,
  input: IUpdateProfileInput,
): Promise<IUserPayload> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    },
    select: USER_SELECT,
  });

  return toUserPayload(user);
}

export async function listUsers(
  query: Record<string, unknown>,
): Promise<{ users: IUserPayload[]; meta: IPaginationMeta }> {
  const queryBuilder = new QueryBuilder(query, {
    sortBy: "createdAt",
    searchableFields: ["name", "email", "phone"],
    sortableFields: ["createdAt", "name", "email", "role"],
  });

  const where = queryBuilder.filter("role", query.role ? String(query.role) : undefined).where();

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: queryBuilder.orderBy() as Prisma.UserOrderByWithRelationInput,
      ...queryBuilder.pagination(),
    }),
    prisma.user.count({ where }),
  ]);

  return { users: users.map(toUserPayload), meta: queryBuilder.buildMeta(total) };
}

export async function updateUserRole(
  userId: string,
  role: Role,
  actorId: string,
): Promise<IUserPayload> {
  const user = await prisma.user.findUnique({ where: { id: userId, isDeleted: false } });
  if (!user) throw new AppError(404, "User not found.");

  const previousRole = user.role;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.user.update({
      where: { id: userId },
      data: { role },
      select: USER_SELECT,
    });

    await logAudit({
      action: "ROLE_CHANGED",
      actorId,
      entityType: "User",
      entityId: userId,
      oldValue: { role: previousRole },
      newValue: { role },
      tx,
    });

    return result;
  });

  return toUserPayload(updated);
}

export { Role };
