import { randomBytes } from "node:crypto";

export interface IFeeBreakdown {
  total: number;
  baseFee: number;
  weightFee: number;
  zoneSurcharge: number;
  currency: string;
}

const ZONE_ADJUSTMENT: Record<string, number> = {
  "inner-city": 0,
  city: 30,
  suburb: 50,
  outer: 70,
  "inter-city": 100,
  remote: 150,
};

export const FEE_CONFIG = {
  baseFee: 60,
  perKg: 25,
  defaultZoneAdjustment: 40,
};

export function zoneAdjustment(zoneCode: string): number {
  return ZONE_ADJUSTMENT[zoneCode] ?? FEE_CONFIG.defaultZoneAdjustment;
}

/**
 * Calculates the parcel delivery fee from { base + weight × perKg + zone surcharges }.
 */
export function calculateFee(
  weightKg: number,
  originZone: string,
  destinationZone: string,
): IFeeBreakdown {
  const baseFee = FEE_CONFIG.baseFee;
  const weightFee = weightKg * FEE_CONFIG.perKg;
  const zoneSurcharge = zoneAdjustment(originZone) + zoneAdjustment(destinationZone);
  const total = Math.round((baseFee + weightFee + zoneSurcharge) * 100) / 100;

  return { total, baseFee, weightFee, zoneSurcharge, currency: "BDT" };
}

const TRACKING_PREFIX = "BC";

export function generateTrackingNumber(): string {
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = randomBytes(3).toString("hex").toUpperCase();
  return `${TRACKING_PREFIX}${timePart}${randomPart}`;
}
