import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/config";
import { cleanupFixtures, testEmail } from "../helpers/fixtures";

const createdUserIds: string[] = [];

afterAll(async () => {
  await cleanupFixtures({ userIds: createdUserIds });
  await prisma.$disconnect();
});

describe("Auth flows", () => {
  const email = testEmail("register");
  const password = "TestPass@123";

  it("registers a new customer and returns tokens", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      name: "QA Register",
      email,
      password,
      role: "CUSTOMER",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.tokens.refreshToken).toBeTruthy();
    // password hash must never be exposed in the response
    expect(res.body.data.user.password).toBeUndefined();

    createdUserIds.push(res.body.data.user.id);
  });

  it("rejects duplicate registration with a 409", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      name: "QA Register",
      email,
      password,
      role: "CUSTOMER",
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("rejects self-registration as ADMIN", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      name: "QA Admin",
      email: testEmail("admin-attempt"),
      password,
      role: "ADMIN",
    });

    expect(res.status).toBe(400);
  });

  it("rejects login with a wrong password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "WrongPassword1" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
  });

  it("rejects access to a protected route with no token", async () => {
    const res = await request(app).get("/api/v1/users/me");
    expect(res.status).toBe(401);
  });

  it("rejects access to a protected route with a malformed token", async () => {
    const res = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("returns the current profile for a valid token", async () => {
    const login = await request(app).post("/api/v1/auth/login").send({ email, password });
    const token = login.body.data.tokens.accessToken as string;

    const res = await request(app).get("/api/v1/users/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(email);
  });

  it("blocks a CUSTOMER from the admin-only user list (RBAC)", async () => {
    const login = await request(app).post("/api/v1/auth/login").send({ email, password });
    const token = login.body.data.tokens.accessToken as string;

    const res = await request(app).get("/api/v1/users").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("logout revokes the refresh token so it can no longer be exchanged", async () => {
    const login = await request(app).post("/api/v1/auth/login").send({ email, password });
    const refreshToken = login.body.data.tokens.refreshToken as string;

    // still valid before logout
    const beforeLogout = await request(app).post("/api/v1/auth/refresh-token").send({ refreshToken });
    expect(beforeLogout.status).toBe(200);

    const logoutRes = await request(app).post("/api/v1/auth/logout").send({ refreshToken });
    expect(logoutRes.status).toBe(200);

    const afterLogout = await request(app).post("/api/v1/auth/refresh-token").send({ refreshToken });
    expect(afterLogout.status).toBe(401);
  });

  it("rejects logout with a garbage refresh token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/logout")
      .send({ refreshToken: "not-a-real-token" });

    expect(res.status).toBe(401);
  });
});
