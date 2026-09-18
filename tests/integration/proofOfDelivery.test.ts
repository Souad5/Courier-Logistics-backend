import { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/config";
import { cleanupFixtures, createTestHub, createTestParcel, createTestUser } from "../helpers/fixtures";

// These tests deliberately never reach `uploadToCloudinary`: every case here
// is rejected by validation (MIME type / file size / missing file) or by the
// service's status guard *before* the Cloudinary call, so the suite never
// creates a real asset in the project's live Cloudinary account. The happy
// path (an actual accepted upload) is not covered here for that reason — see
// the final audit report's "Remaining Issues" section.

const userIds: string[] = [];
const hubIds: string[] = [];
const parcelIds: string[] = [];

let courierToken: string;
let pendingParcelId: string;
let deliverableParcelId: string;

afterAll(async () => {
  await cleanupFixtures({ userIds, hubIds, parcelIds });
  await prisma.$disconnect();
});

beforeAll(async () => {
  const [sender, courier] = await Promise.all([
    createTestUser({ role: Role.CUSTOMER, label: "pod-sender" }),
    createTestUser({ role: Role.COURIER, label: "pod-courier", isAvailable: true }),
  ]);
  userIds.push(sender.id, courier.id);

  const [origin, destination] = await Promise.all([createTestHub(), createTestHub()]);
  hubIds.push(origin.id, destination.id);

  const [pending, deliverable] = await Promise.all([
    createTestParcel({
      senderId: sender.id,
      originHubId: origin.id,
      destinationHubId: destination.id,
      courierId: courier.id,
      status: "ACCEPTED",
    }),
    createTestParcel({
      senderId: sender.id,
      originHubId: origin.id,
      destinationHubId: destination.id,
      courierId: courier.id,
      status: "OUT_FOR_DELIVERY",
    }),
  ]);
  parcelIds.push(pending.id, deliverable.id);
  pendingParcelId = pending.id;
  deliverableParcelId = deliverable.id;

  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: courier.email, password: "TestPass@123" });
  courierToken = login.body.data.tokens.accessToken;
});

describe("Proof-of-delivery upload guards", () => {
  it("rejects a non-image MIME type before any upload is attempted", async () => {
    const res = await request(app)
      .post(`/api/v1/parcels/${deliverableParcelId}/proof-of-delivery`)
      .set("Authorization", `Bearer ${courierToken}`)
      .attach("photo", Buffer.from("not an image"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(400);
  });

  it("rejects a file over the 5MB limit", async () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    const res = await request(app)
      .post(`/api/v1/parcels/${deliverableParcelId}/proof-of-delivery`)
      .set("Authorization", `Bearer ${courierToken}`)
      .attach("photo", oversized, { filename: "huge.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(400);
  });

  it("requires a file to be attached", async () => {
    const res = await request(app)
      .post(`/api/v1/parcels/${deliverableParcelId}/proof-of-delivery`)
      .set("Authorization", `Bearer ${courierToken}`);

    expect(res.status).toBe(400);
  });

  it("refuses to attach proof to a parcel that isn't out-for-delivery/delivered", async () => {
    const res = await request(app)
      .post(`/api/v1/parcels/${pendingParcelId}/proof-of-delivery`)
      .set("Authorization", `Bearer ${courierToken}`)
      .attach("photo", Buffer.from([0xff, 0xd8, 0xff]), {
        filename: "tiny.jpg",
        contentType: "image/jpeg",
      });

    // Assigned to this courier and a valid image, but status is ACCEPTED —
    // rejected by the service's status guard before Cloudinary is ever called.
    expect(res.status).toBe(409);
  });
});
