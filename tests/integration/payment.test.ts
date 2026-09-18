import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/config";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Stripe webhook safety", () => {
  it("rejects a webhook call with no signature header", async () => {
    const res = await request(app)
      .post("/api/v1/payments/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "checkout.session.completed", data: { object: {} } }));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("rejects a webhook call with a forged/invalid signature", async () => {
    const res = await request(app)
      .post("/api/v1/payments/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=1,v1=deadbeef")
      .send(JSON.stringify({ type: "checkout.session.completed", data: { object: {} } }));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("never trusts a client-supplied payment status", async () => {
    // There is deliberately no endpoint that accepts a client-provided
    // { status: "PAID" } body — payment status only ever changes through the
    // signature-verified webhook above. Confirm the route surface stays that way.
    const res = await request(app)
      .post("/api/v1/payments/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ status: "PAID" }));

    expect(res.status).toBe(400); // rejected for lacking a valid signature, not accepted
  });
});
