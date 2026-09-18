import { type Hub, Prisma } from "@prisma/client";

import { prisma } from "../../../config";
import { cacheGet, cacheIncr, cacheSet } from "../../../config/redis";
import { type IPaginationMeta, QueryBuilder } from "../../builder/QueryBuilder";
import { AppError } from "../../errors/AppError";
import { logAudit } from "../../utils/audit";
import type { ICreateHubInput, IHubPayload, IUpdateHubInput } from "./hub.interface";

// Hubs are admin-managed and change rarely but `GET /hubs` is public and
// customer-facing (looked up before every parcel creation). Cache list pages
// behind a version counter: any hub write bumps the version, which changes
// every cache key at once — no stale reads, no need to enumerate/scan keys.
const HUB_LIST_CACHE_TTL_SECONDS = 120;
const HUB_LIST_VERSION_KEY = "hubs:list:version";

async function hubListCacheKey(query: Record<string, unknown>): Promise<string> {
  const version = (await cacheGet(HUB_LIST_VERSION_KEY)) ?? "0";
  return `hubs:list:v${version}:${JSON.stringify(query)}`;
}

async function invalidateHubListCache(): Promise<void> {
  await cacheIncr(HUB_LIST_VERSION_KEY);
}

const HUB_SELECT = {
  id: true,
  name: true,
  code: true,
  zoneCode: true,
  zoneName: true,
  address: true,
  city: true,
  lat: true,
  lng: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.HubSelect;

type HubSelectPayload = Prisma.HubGetPayload<{ select: typeof HUB_SELECT }>;

function toHubPayload(hub: HubSelectPayload): IHubPayload {
  return {
    id: hub.id,
    name: hub.name,
    code: hub.code,
    zoneCode: hub.zoneCode,
    zoneName: hub.zoneName,
    address: hub.address,
    city: hub.city,
    lat: hub.lat,
    lng: hub.lng,
    isDeleted: hub.isDeleted,
    createdAt: hub.createdAt,
    updatedAt: hub.updatedAt,
  };
}

export async function createHub(input: ICreateHubInput, actorId: string): Promise<IHubPayload> {
  let hub: Hub;
  try {
    hub = await prisma.hub.create({
      data: {
        name: input.name.trim(),
        code: input.code.trim().toUpperCase(),
        zoneCode: input.zoneCode.trim(),
        zoneName: input.zoneName.trim(),
        address: input.address.trim(),
        city: input.city,
        lat: input.lat,
        lng: input.lng,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "A hub with this code already exists.");
    }
    throw error;
  }

  await logAudit({
    action: "HUB_CREATED",
    actorId,
    entityType: "Hub",
    entityId: hub.id,
    newValue: { name: hub.name, code: hub.code, zoneCode: hub.zoneCode },
  });

  await invalidateHubListCache();

  return toHubPayload(hub);
}

export async function listHubs(
  query: Record<string, unknown>,
): Promise<{ hubs: IHubPayload[]; meta: IPaginationMeta }> {
  const cacheKey = await hubListCacheKey(query);
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached) as { hubs: IHubPayload[]; meta: IPaginationMeta };

  // Accept `searchTerm` as the canonical free-text query param, falling back
  // to `search` so the generic QueryBuilder convention keeps working.
  const search = query.searchTerm ?? query.search;

  const queryBuilder = new QueryBuilder(
    { ...query, search },
    {
      sortBy: "createdAt",
      searchableFields: ["name", "zoneName", "city"],
      sortableFields: ["createdAt", "name", "city", "zoneName"],
    },
  );

  const where = queryBuilder
    .filter("zoneCode", query.zoneCode ? String(query.zoneCode) : undefined)
    .filter("zoneName", query.zoneName ? String(query.zoneName) : undefined)
    .filter("city", query.city ? String(query.city) : undefined)
    .where();

  const [hubs, total] = await prisma.$transaction([
    prisma.hub.findMany({
      where,
      select: HUB_SELECT,
      orderBy: queryBuilder.orderBy() as Prisma.HubOrderByWithRelationInput,
      ...queryBuilder.pagination(),
    }),
    prisma.hub.count({ where }),
  ]);

  const result = { hubs: hubs.map(toHubPayload), meta: queryBuilder.buildMeta(total) };
  await cacheSet(cacheKey, JSON.stringify(result), HUB_LIST_CACHE_TTL_SECONDS);

  return result;
}

export async function updateHub(
  hubId: string,
  input: IUpdateHubInput,
  actorId: string,
): Promise<IHubPayload> {
  const hub = await prisma.hub.findUnique({ where: { id: hubId, isDeleted: false } });
  if (!hub) throw new AppError(404, "Hub not found.");

  const updated = await prisma.$transaction(
    async (tx) => {
      const result = await tx.hub.update({
        where: { id: hubId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.code !== undefined ? { code: input.code.trim().toUpperCase() } : {}),
          ...(input.zoneCode !== undefined ? { zoneCode: input.zoneCode.trim() } : {}),
          ...(input.zoneName !== undefined ? { zoneName: input.zoneName.trim() } : {}),
          ...(input.address !== undefined ? { address: input.address.trim() } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.lat !== undefined ? { lat: input.lat } : {}),
          ...(input.lng !== undefined ? { lng: input.lng } : {}),
        },
        select: HUB_SELECT,
      });

      await logAudit({
        action: "HUB_UPDATED",
        actorId,
        entityType: "Hub",
        entityId: hubId,
        oldValue: { name: hub.name, zoneCode: hub.zoneCode },
        newValue: { name: result.name, zoneCode: result.zoneCode },
        tx,
      });

      return result;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );

  await invalidateHubListCache();

  return toHubPayload(updated);
}

export async function softDeleteHub(hubId: string, actorId: string): Promise<void> {
  const hub = await prisma.hub.findUnique({ where: { id: hubId, isDeleted: false } });
  if (!hub) throw new AppError(404, "Hub not found.");

  const destinationCount = await prisma.parcel.count({
    where: { destinationHubId: hubId, isDeleted: false, status: { not: "DELIVERED" } },
  });
  if (destinationCount > 0) {
    throw new AppError(409, "Cannot delete this hub: it has active parcels routed to it.");
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.hub.update({
        where: { id: hubId },
        data: { isDeleted: true },
      });

      await logAudit({
        action: "HUB_DELETED",
        actorId,
        entityType: "Hub",
        entityId: hubId,
        oldValue: { name: hub.name },
        tx,
      });
    },
    { maxWait: 10_000, timeout: 20_000 },
  );

  await invalidateHubListCache();
}
