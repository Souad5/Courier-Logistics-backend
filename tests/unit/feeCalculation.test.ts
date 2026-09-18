import { describe, expect, it } from "vitest";

import { FEE_CONFIG, calculateFee, generateTrackingNumber } from "../../src/app/modules/parcel/parcel.constant";

describe("calculateFee", () => {
  it("computes total as base + weight*perKg + origin/destination zone surcharge", () => {
    const result = calculateFee(2, "inner-city", "city");

    expect(result.baseFee).toBe(FEE_CONFIG.baseFee);
    expect(result.weightFee).toBe(2 * FEE_CONFIG.perKg);
    expect(result.zoneSurcharge).toBe(0 + 30); // inner-city=0, city=30
    expect(result.total).toBe(result.baseFee + result.weightFee + result.zoneSurcharge);
    expect(result.currency).toBe("BDT");
  });

  it("falls back to the default zone adjustment for an unrecognized zone code", () => {
    const known = calculateFee(1, "inner-city", "inner-city");
    const unknown = calculateFee(1, "inner-city", "some-unmapped-zone");

    // unknown zone should cost more than the cheapest known zone (default > 0)
    expect(unknown.total).toBeGreaterThan(known.total);
  });

  it("never trusts a caller-supplied price — output is purely a function of weight/zones", () => {
    const a = calculateFee(3.5, "outer", "remote");
    const b = calculateFee(3.5, "outer", "remote");

    expect(a.total).toBe(b.total);
  });
});

describe("generateTrackingNumber", () => {
  it("produces a unique, prefixed, uppercase tracking number each call", () => {
    const a = generateTrackingNumber();
    const b = generateTrackingNumber();

    expect(a).toMatch(/^BC[A-Z0-9]+$/);
    expect(b).toMatch(/^BC[A-Z0-9]+$/);
    expect(a).not.toBe(b);
  });
});
