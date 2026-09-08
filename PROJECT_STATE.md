# Courier & Logistics Platform - Project State Tracker

Last Updated: 2026-09-09

## 1. Project Overview & Tech Stack
- Framework: Express 5 + TypeScript (layered: Routes → Controllers → Services → Prisma)
- Database & ORM: PostgreSQL + Prisma ORM (6.x, transactions, soft deletes, indexes)
- Validation: Zod (on every POST/PATCH/PUT + env schema in `src/config/index.ts`)
- Auth: JWT (access + refresh tokens) + Role-Based Access Control (RBAC), bcrypt hashing, Google OAuth (ID-token verification)
- Payments: Stripe Checkout sessions + signature-verified webhooks
- Extras: Redis (`ioredis`), Cloudinary uploads, helmet/CORS/rate-limit, Biome static check
- Deploy: Vercel serverless (`api/index.ts`) or Render (long-running process)

## 2. Completed Architecture & Structure
- [x] `package.json` / `tsconfig.json` / `biome.json` / `vercel.json` / `.gitignore` - Project tooling
- [x] `prisma/schema.prisma` - DB Schema (User, Hub, Parcel, ParcelStatusHistory, Payment, AuditLog)
- [x] `prisma/seed.ts` - Demo seed: 1 admin, 2 couriers, 2 customers, 3 hubs, 5 parcels
- [x] `src/config/index.ts` - Zod-validated env + singleton Prisma client
- [x] `src/config/redis.ts` - Optional Redis cache helpers
- [x] `src/config/cloudinary.ts` - Cloudinary config + upload helper
- [x] `src/@types/index.d.ts` - Express.Request augmentation (user on request)
- [x] `src/app/errors/AppError.ts`, `handleZodError.ts`, `globalErrorHandler.ts` - Centralized errors
- [x] `src/app/utils/sendResponse.ts` - `{success,message,meta?,data}` / error envelope
- [x] `src/app/utils/jwtHelpers.ts` - signAccessToken / signTokens / verifyRefreshToken
- [x] `src/app/utils/catchAsync.ts` - Async handler wrapper
- [x] `src/app/utils/audit.ts` - Transaction-aware audit logger
- [x] `src/app/middlewares/auth.ts` - `authenticate` + `authorizeRoles`
- [x] `src/app/middlewares/validateRequest.ts` - Zod validation middleware
- [x] `src/app/middlewares/rateLimiter.ts` - Login/auth rate limiter
- [x] `src/app/builder/QueryBuilder.ts` - Pagination, filter, sort, case-insensitive search (field whitelist)
- [x] `src/app/routes/index.ts` - Versioned `/api/v1` router (auth, users, hubs, parcels, payments, admin)
- [x] `src/app.ts` - Express app setup (helmet, CORS, rate-limit, webhook raw-body parser, error handler, 404)
- [x] `src/server.ts` - HTTP Server setup (local entrypoint, dev via `tsx watch`)
- [x] `api/index.ts` - Vercel serverless handler
- [x] `src/app/modules/auth/*` - interface, validation, service, controller, route
- [x] `src/app/modules/user/*` - interface, validation, service, controller, route
- [x] `src/app/modules/hub/*` - interface, validation, service, controller, route
- [x] `src/app/modules/parcel/*` - interface, validation, service, controller, route
- [x] `src/app/modules/payment/*` - interface, validation, service, controller, route
- [x] `src/app/modules/auditLog/*` - interface, service, controller, route
- [x] `README.md` - Full API reference + setup/deployment guide
- [x] `.env.example` - All required/optional env vars documented

## 3. Implemented API Endpoints Tracker (Target: 20+, 24 implemented)
Format: `[HTTP METHOD] [ENDPOINT] - [Status: Done/Pending] - [Roles Allowed]`

- [x] GET `/api/v1/health` - Done - Public
- [x] GET `/api/v1/` - Done - Public (API root/version info)
- [x] POST `/api/v1/auth/register` - Done - Public (self-registers CUSTOMER/COURIER only)
- [x] POST `/api/v1/auth/login` - Done - Public (rate-limited)
- [x] POST `/api/v1/auth/google-login` - Done - Public (Google ID token)
- [x] POST `/api/v1/auth/refresh-token` - Done - Public (valid refresh token)
- [x] GET `/api/v1/users/me` - Done - Authenticated Users
- [x] PATCH `/api/v1/users/me` - Done - Authenticated Users
- [x] GET `/api/v1/users` - Done - Admin
- [x] PATCH `/api/v1/users/:id/role` - Done - Admin
- [x] POST `/api/v1/hubs` - Done - Admin
- [x] GET `/api/v1/hubs` - Done - Public
- [x] PATCH `/api/v1/hubs/:id` - Done - Admin
- [x] DELETE `/api/v1/hubs/:id` - Done - Admin (soft delete; 409 if active parcels routed)
- [x] POST `/api/v1/parcels` - Done - Customer (fee computed server-side)
- [x] GET `/api/v1/parcels` - Done - Admin
- [x] GET `/api/v1/parcels/my-parcels` - Done - Customer/Courier
- [x] GET `/api/v1/parcels/track/:trackingNumber` - Done - Public (last 10 history entries)
- [x] PATCH `/api/v1/parcels/:id/assign` - Done - Admin (PENDING → ACCEPTED)
- [x] PATCH `/api/v1/parcels/:id/status` - Done - Courier/Admin (validated transitions)
- [x] DELETE `/api/v1/parcels/:id` - Done - Sender (pending only) or Admin
- [x] POST `/api/v1/payments/initiate` - Done - Customer (Stripe Checkout session)
- [x] POST `/api/v1/payments/webhook` - Done - Stripe (signature verify; raw body)
- [x] GET `/api/v1/payments/:id` - Done - Sender or Admin
- [x] GET `/api/v1/admin/dashboard-stats` - Done - Admin
- [x] GET `/api/v1/admin/audit-logs` - Done - Admin

## 4. Completed Modules Summary
- **Auth Module:** Registration (bcrypt SALT_ROUNDS=12, duplicate-email 409), login (401 on bad creds, 403 if inactive), Google ID-token verification + upsert (default CUSTOMER, 503 if not configured), refresh-token rotation. All sign actions audited. Login/register/google return `{ user, tokens }`.
- **User Module:** `GET /me` and `PATCH /me` for any authenticated user; admin list (`page,limit,sortBy,sortOrder,search,role`) and `PATCH /:id/role` (role changes audited via `logAudit`).
- **Hub Module:** CRUD with unique `code` (409), soft delete blocked with 409 when parcels are still routed to the hub (checked via `prisma.parcel.count` on non-terminal statuses).
- **Parcel Module:** Full lifecycle `PENDING → ACCEPTED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED` (+ CANCELLED), strict transition whitelist, fee = base + weight×rate + zone surcharge (server-side), unique `trackingNumber`, assignment validates the user is a real courier, public tracking, sender/admin soft delete rules. All mutations in `prisma.$transaction` with status history + audit.
- **Payment Module:** Stripe Checkout init (validates ownership, PENDING only, idempotent re-init; 409 if already paid), webhook with signature verification that atomically marks Payment→PAID + Parcel→ACCEPTED (idempotent via status guard), failed/expired sessions → Payment→FAILED, `GET /payments/:id` ownership-scoped. `getStripe()` throws 503 when STRIPE_SECRET_KEY missing.
- **Admin/Audit Module:** `dashboard-stats` (totalIncome, customer/courier counts, delivered/pending/cancelled, status breakdown via groupBy) and paginated `audit-logs` filtered by action/entityType/entityId. Audit logger is transaction-aware (`tx`-optional `logAudit`).
- **Shared:** `QueryBuilder` (whitelisted sort/search fields, filter chaining, `buildMeta` with `{page,limit,total,totalPages}`), `globalErrorHandler` mapping AppError/Zod(400)/Prisma P2002(409)/invalid JSON(400)/fallback(500), envelope helpers.

## 5. Next Planned Actions (Todo List)
1. `git push origin main` from the user's machine (sandbox has no GitHub credentials) - 24 commits ready, fast-forward.
2. Run `prisma migrate dev` + `npm run seed` against a live Postgres and smoke-test all 24 endpoints end-to-end.
3. (Optional) Write unit/integration tests (vitest/jest) for auth, parcel transitions, fee calc, and webhook idempotency.
4. (Optional) Add email-verification flow (`isEmailVerified` field exists; register message mentions verification but no emailer wired yet).
5. (Optional) Deploy to Vercel/Render and configure Stripe webhook to the public URL.
6. (Optional) Build a Postman/Thunder Client collection to share with the team.