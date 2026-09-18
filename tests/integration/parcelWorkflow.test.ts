import { Role, UserStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/config";
import { calculateFee } from "../../src/app/modules/parcel/parcel.constant";
import {
  TEST_PASSWORD,
  cleanupFixtures,
  createTestHub,
  createTestUser,
} from "../helpers/fixtures";

const userIds: string[] = [];
const hubIds: string[] = [];
const parcelIds: string[] = [];

let customerAToken: string;
let customerBToken: string;
let adminToken: string;
let originHubId: string;
let destinationHubId: string;

async function loginAs(email: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: TEST_PASSWORD });
  return res.body.data.tokens.accessToken as string;
}

beforeAll(async () => {
  const [customerA, customerB, admin] = await Promise.all([
    createTestUser({ role: Role.CUSTOMER, label: "customer-a" }),
    createTestUser({ role: Role.CUSTOMER, label: "customer-b" }),
    createTestUser({ role: Role.ADMIN, label: "admin" }),
  ]);
  userIds.push(customerA.id, customerB.id, admin.id);

  const [originHub, destinationHub] = await Promise.all([
    createTestHub({ zoneCode: "inner-city", zoneName: "Inner City" }),
    createTestHub({ zoneCode: "city", zoneName: "City" }),
  ]);
  hubIds.push(originHub.id, destinationHub.id);
  originHubId = originHub.id;
  destinationHubId = destinationHub.id;

  [customerAToken, customerBToken, adminToken] = await Promise.all([
    loginAs(customerA.email),
    loginAs(customerB.email),
    loginAs(admin.email),
  ]);
});

afterAll(async () => {
  await cleanupFixtures({ userIds, hubIds, parcelIds });
  await prisma.$disconnect();
});

describe("Parcel creation & pricing", () => {
  it("computes the fee server-side and ignores any client-supplied price", async () => {
    const expected = calculateFee(2.5, "inner-city", "city");

    const res = await request(app)
      .post("/api/v1/parcels")
      .set("Authorization", `Bearer ${customerAToken}`)
      .send({
        weightKg: 2.5,
        originHubId,
        destinationHubId,
        senderName: "QA Sender",
        senderPhone: "+8801000000000",
        senderAddress: "1 Test Street",
        receiverName: "QA Receiver",
        receiverPhone: "+8801000000001",
        receiverAddress: "2 Test Street",
        // attempt to inject a client-controlled price — must be ignored
        fee: 1,
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.data.parcel.fee)).toBeCloseTo(expected.total, 2);
    expect(res.body.data.parcel.status).toBe("PENDING");
    parcelIds.push(res.body.data.parcel.id);
  });

  it("rejects an invalid origin/destination hub id", async () => {
    const res = await request(app)
      .post("/api/v1/parcels")
      .set("Authorization", `Bearer ${customerAToken}`)
      .send({
        weightKg: 1,
        originHubId: "00000000-0000-0000-0000-000000000000",
        destinationHubId,
        senderName: "QA Sender",
        senderPhone: "+8801000000000",
        senderAddress: "1 Test Street",
        receiverName: "QA Receiver",
        receiverPhone: "+8801000000001",
        receiverAddress: "2 Test Street",
      });

    expect(res.status).toBe(404);
  });

  it("rejects a negative/zero weight at the validation layer", async () => {
    const res = await request(app)
      .post("/api/v1/parcels")
      .set("Authorization", `Bearer ${customerAToken}`)
      .send({
        weightKg: -1,
        originHubId,
        destinationHubId,
        senderName: "QA Sender",
        senderPhone: "+8801000000000",
        senderAddress: "1 Test Street",
        receiverName: "QA Receiver",
        receiverPhone: "+8801000000001",
        receiverAddress: "2 Test Street",
      });

    expect(res.status).toBe(400);
  });
});

describe("IDOR protection", () => {
  let parcelId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/v1/parcels")
      .set("Authorization", `Bearer ${customerAToken}`)
      .send({
        weightKg: 1,
        originHubId,
        destinationHubId,
        senderName: "QA Sender",
        senderPhone: "+8801000000000",
        senderAddress: "1 Test Street",
        receiverName: "QA Receiver",
        receiverPhone: "+8801000000001",
        receiverAddress: "2 Test Street",
      });
    parcelId = res.body.data.parcel.id;
    parcelIds.push(parcelId);
  });

  it("prevents customer B from initiating payment on customer A's parcel", async () => {
    const res = await request(app)
      .post("/api/v1/payments/initiate")
      .set("Authorization", `Bearer ${customerBToken}`)
      .send({ parcelId });

    expect(res.status).toBe(403);
  });

  it("prevents customer B from deleting customer A's parcel", async () => {
    const res = await request(app)
      .delete(`/api/v1/parcels/${parcelId}`)
      .set("Authorization", `Bearer ${customerBToken}`);

    expect(res.status).toBe(403);
  });

  it("does not leak customer A's parcel into customer B's own-parcels list", async () => {
    const res = await request(app)
      .get("/api/v1/parcels/my-parcels")
      .set("Authorization", `Bearer ${customerBToken}`);

    expect(res.status).toBe(200);
    const ids = (res.body.data.parcels as Array<{ id: string }>).map((p) => p.id);
    expect(ids).not.toContain(parcelId);
  });

  it("blocks customer B from fetching customer A's parcel by id, but allows the owner", async () => {
    const forbidden = await request(app)
      .get(`/api/v1/parcels/${parcelId}`)
      .set("Authorization", `Bearer ${customerBToken}`);
    expect(forbidden.status).toBe(403);

    const allowed = await request(app)
      .get(`/api/v1/parcels/${parcelId}`)
      .set("Authorization", `Bearer ${customerAToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.parcel.id).toBe(parcelId);
  });
});

describe("State machine enforcement & courier assignment rules", () => {
  it("rejects fabricating ACCEPTED via the generic status endpoint (payment/assign-only)", async () => {
    const created = await request(app)
      .post("/api/v1/parcels")
      .set("Authorization", `Bearer ${customerAToken}`)
      .send({
        weightKg: 1,
        originHubId,
        destinationHubId,
        senderName: "QA Sender",
        senderPhone: "+8801000000000",
        senderAddress: "1 Test Street",
        receiverName: "QA Receiver",
        receiverPhone: "+8801000000001",
        receiverAddress: "2 Test Street",
      });
    const parcelId = created.body.data.parcel.id as string;
    parcelIds.push(parcelId);

    const res = await request(app)
      .patch(`/api/v1/parcels/${parcelId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "ACCEPTED" });

    expect(res.status).toBe(400);
  });

  it("refuses to assign a courier whose account is not ACTIVE", async () => {
    const suspendedCourier = await createTestUser({
      role: Role.COURIER,
      label: "suspended-courier",
      status: UserStatus.SUSPENDED,
      isAvailable: true,
    });
    userIds.push(suspendedCourier.id);

    const created = await request(app)
      .post("/api/v1/parcels")
      .set("Authorization", `Bearer ${customerAToken}`)
      .send({
        weightKg: 1,
        originHubId,
        destinationHubId,
        senderName: "QA Sender",
        senderPhone: "+8801000000000",
        senderAddress: "1 Test Street",
        receiverName: "QA Receiver",
        receiverPhone: "+8801000000001",
        receiverAddress: "2 Test Street",
      });
    parcelIds.push(created.body.data.parcel.id);

    const res = await request(app)
      .patch(`/api/v1/parcels/${created.body.data.parcel.id}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ courierId: suspendedCourier.id });

    expect(res.status).toBe(409);
  });

  it("refuses to assign a courier who has marked themselves unavailable", async () => {
    const busyCourier = await createTestUser({
      role: Role.COURIER,
      label: "busy-courier",
      isAvailable: false,
    });
    userIds.push(busyCourier.id);

    const created = await request(app)
      .post("/api/v1/parcels")
      .set("Authorization", `Bearer ${customerAToken}`)
      .send({
        weightKg: 1,
        originHubId,
        destinationHubId,
        senderName: "QA Sender",
        senderPhone: "+8801000000000",
        senderAddress: "1 Test Street",
        receiverName: "QA Receiver",
        receiverPhone: "+8801000000001",
        receiverAddress: "2 Test Street",
      });
    parcelIds.push(created.body.data.parcel.id);

    const res = await request(app)
      .patch(`/api/v1/parcels/${created.body.data.parcel.id}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ courierId: busyCourier.id });

    expect(res.status).toBe(409);
  });

  it("walks a parcel through pickup -> transit -> failed delivery -> retry -> delivered", async () => {
    const courier = await createTestUser({
      role: Role.COURIER,
      label: "delivery-courier",
      isAvailable: true,
    });
    userIds.push(courier.id);
    const courierToken = await loginAs(courier.email);

    const created = await request(app)
      .post("/api/v1/parcels")
      .set("Authorization", `Bearer ${customerAToken}`)
      .send({
        weightKg: 1,
        originHubId,
        destinationHubId,
        senderName: "QA Sender",
        senderPhone: "+8801000000000",
        senderAddress: "1 Test Street",
        receiverName: "QA Receiver",
        receiverPhone: "+8801000000001",
        receiverAddress: "2 Test Street",
      });
    const parcelId = created.body.data.parcel.id as string;
    parcelIds.push(parcelId);

    const assign = await request(app)
      .patch(`/api/v1/parcels/${parcelId}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ courierId: courier.id });
    expect(assign.status).toBe(200);
    expect(assign.body.data.parcel.status).toBe("ACCEPTED");

    const step = (status: string, note?: string) =>
      request(app)
        .patch(`/api/v1/parcels/${parcelId}/status`)
        .set("Authorization", `Bearer ${courierToken}`)
        .send({ status, note });

    expect((await step("PICKED_UP")).status).toBe(200);
    expect((await step("IN_TRANSIT")).status).toBe(200);
    expect((await step("OUT_FOR_DELIVERY")).status).toBe(200);

    // a failed attempt requires a reason
    const noReason = await step("DELIVERY_FAILED");
    expect(noReason.status).toBe(400);

    const failed = await step("DELIVERY_FAILED", "Receiver not home");
    expect(failed.status).toBe(200);

    const retry = await step("OUT_FOR_DELIVERY");
    expect(retry.status).toBe(200);

    const delivered = await step("DELIVERED");
    expect(delivered.status).toBe(200);
    expect(delivered.body.data.parcel.status).toBe("DELIVERED");

    // terminal — no further transitions allowed
    const afterTerminal = await step("CANCELLED");
    expect(afterTerminal.status).toBe(400);
  });

  it("forces return-to-sender once max delivery attempts are exhausted", async () => {
    const courier = await createTestUser({
      role: Role.COURIER,
      label: "return-courier",
      isAvailable: true,
    });
    userIds.push(courier.id);
    const courierToken = await loginAs(courier.email);

    const created = await request(app)
      .post("/api/v1/parcels")
      .set("Authorization", `Bearer ${customerAToken}`)
      .send({
        weightKg: 1,
        originHubId,
        destinationHubId,
        senderName: "QA Sender",
        senderPhone: "+8801000000000",
        senderAddress: "1 Test Street",
        receiverName: "QA Receiver",
        receiverPhone: "+8801000000001",
        receiverAddress: "2 Test Street",
      });
    const parcelId = created.body.data.parcel.id as string;
    parcelIds.push(parcelId);

    await request(app)
      .patch(`/api/v1/parcels/${parcelId}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ courierId: courier.id });

    const step = (status: string, note?: string) =>
      request(app)
        .patch(`/api/v1/parcels/${parcelId}/status`)
        .set("Authorization", `Bearer ${courierToken}`)
        .send({ status, note });

    await step("PICKED_UP");
    await step("IN_TRANSIT");

    // fail 3 times (MAX_DELIVERY_ATTEMPTS), retrying twice in between
    await step("OUT_FOR_DELIVERY");
    await step("DELIVERY_FAILED", "Attempt 1 failed");
    await step("OUT_FOR_DELIVERY");
    await step("DELIVERY_FAILED", "Attempt 2 failed");
    await step("OUT_FOR_DELIVERY");
    const thirdFailure = await step("DELIVERY_FAILED", "Attempt 3 failed");
    expect(thirdFailure.status).toBe(200);

    // cap reached — retrying again must be rejected
    const blockedRetry = await step("OUT_FOR_DELIVERY");
    expect(blockedRetry.status).toBe(409);

    const returnToSender = await step("RETURN_TO_SENDER");
    expect(returnToSender.status).toBe(200);

    const returned = await step("RETURNED");
    expect(returned.status).toBe(200);
    expect(returned.body.data.parcel.status).toBe("RETURNED");
  });
});
