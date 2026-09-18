import { ParcelStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { AppError } from "../../src/app/errors/AppError";
import {
  ALLOWED_TRANSITIONS,
  MAX_DELIVERY_ATTEMPTS,
  TERMINAL_STATUSES,
  assertValidTransition,
} from "../../src/app/modules/parcel/parcel.service";

describe("assertValidTransition", () => {
  it("allows the documented happy-path lifecycle", () => {
    const steps: [ParcelStatus, ParcelStatus][] = [
      [ParcelStatus.ACCEPTED, ParcelStatus.PICKED_UP],
      [ParcelStatus.PICKED_UP, ParcelStatus.IN_TRANSIT],
      [ParcelStatus.IN_TRANSIT, ParcelStatus.OUT_FOR_DELIVERY],
      [ParcelStatus.OUT_FOR_DELIVERY, ParcelStatus.DELIVERED],
    ];

    for (const [from, to] of steps) {
      expect(() => assertValidTransition(from, to, 0)).not.toThrow();
    }
  });

  it("rejects skipping states forward", () => {
    expect(() => assertValidTransition(ParcelStatus.PENDING, ParcelStatus.DELIVERED, 0)).toThrow(
      AppError,
    );
    expect(() => assertValidTransition(ParcelStatus.ACCEPTED, ParcelStatus.OUT_FOR_DELIVERY, 0)).toThrow(
      AppError,
    );
  });

  it("rejects moving backward out of a terminal state", () => {
    expect(() => assertValidTransition(ParcelStatus.DELIVERED, ParcelStatus.PICKED_UP, 0)).toThrow(
      AppError,
    );
    expect(() => assertValidTransition(ParcelStatus.CANCELLED, ParcelStatus.OUT_FOR_DELIVERY, 0)).toThrow(
      AppError,
    );
    expect(() => assertValidTransition(ParcelStatus.RETURNED, ParcelStatus.IN_TRANSIT, 0)).toThrow(
      AppError,
    );
  });

  it("rejects re-entering the same status", () => {
    expect(() => assertValidTransition(ParcelStatus.IN_TRANSIT, ParcelStatus.IN_TRANSIT, 0)).toThrow(
      AppError,
    );
  });

  it("blocks PENDING -> ACCEPTED via the generic endpoint (payment/assignment-only transition)", () => {
    expect(() => assertValidTransition(ParcelStatus.PENDING, ParcelStatus.ACCEPTED, 0)).toThrow(
      AppError,
    );
  });

  it("every terminal status has no outgoing transitions", () => {
    for (const status of TERMINAL_STATUSES) {
      expect(ALLOWED_TRANSITIONS[status]).toEqual([]);
    }
  });

  it("allows retrying a failed delivery while under the attempt cap", () => {
    expect(() =>
      assertValidTransition(
        ParcelStatus.DELIVERY_FAILED,
        ParcelStatus.OUT_FOR_DELIVERY,
        MAX_DELIVERY_ATTEMPTS - 1,
      ),
    ).not.toThrow();
  });

  it("forces return-to-sender once the delivery attempt cap is reached", () => {
    expect(() =>
      assertValidTransition(
        ParcelStatus.DELIVERY_FAILED,
        ParcelStatus.OUT_FOR_DELIVERY,
        MAX_DELIVERY_ATTEMPTS,
      ),
    ).toThrow(AppError);

    expect(() =>
      assertValidTransition(ParcelStatus.DELIVERY_FAILED, ParcelStatus.RETURN_TO_SENDER, MAX_DELIVERY_ATTEMPTS),
    ).not.toThrow();
  });

  it("completes the return-to-sender lifecycle", () => {
    expect(() =>
      assertValidTransition(ParcelStatus.RETURN_TO_SENDER, ParcelStatus.RETURNED, 0),
    ).not.toThrow();
  });
});
