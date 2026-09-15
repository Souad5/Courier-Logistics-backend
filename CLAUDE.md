# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Backend-only REST API (no frontend) for a courier/logistics platform: parcel creation → payment → courier assignment → delivery, behind strict role-based access control (`CUSTOMER`, `COURIER`, `ADMIN`). Node.js + TypeScript + Express 5 + PostgreSQL/Prisma. Tested via Postman/Thunder Client; deployed to Vercel (serverless, `api/index.ts`) or Render (long-running, `src/server.ts`).

## Commands

```bash
npm run dev                # dev server with hot reload (tsx watch), http://localhost:5000
npm run build               # tsc -> dist/
npm start                   # run compiled server (dist/server.js)

npm run prisma:generate     # regenerate Prisma client after schema changes
npm run prisma:migrate      # interactive dev migration (prompts for a name)
npm run prisma:migrate:prod # non-interactive migrate deploy
npm run prisma:studio       # open Prisma Studio
npm run seed                # seed demo data (prisma/seed.ts): 1 admin, 2 couriers, 2 customers, 3 hubs, 5 parcels

npm run lint                # biome check ./src
npm run lint:fix            # biome check --write ./src
npm run format               # biome format --write ./src
```

There is no test suite/test script in this repo currently.

Demo accounts after seeding (all password `Password@123`): `admin@courier.com`, `courier1@courier.com`, `courier2@courier.com`, `customer1@courier.com`, `customer2@courier.com`.

## Architecture

Feature-first layered architecture: **Routes → Controllers → Services → Prisma**. Controllers are thin (parse request, delegate); all business logic and `prisma.$transaction` wrapping lives in services; routes only wire middleware + controller. Every domain module under `src/app/modules/<name>/` owns its own `*.interface.ts`, `*.validation.ts` (Zod), `*.service.ts`, `*.controller.ts`, `*.route.ts`.

Modules: `auth`, `user`, `hub`, `parcel`, `payment`, `auditLog`, all mounted under the versioned router at `src/app/routes/index.ts` → `/api/v1`.

Shared/cross-cutting code:
- `src/config/index.ts` — Zod-validated `env`, singleton `prisma` client (cached on `global.__prisma` outside production to survive hot reload), Stripe success/cancel URL fallbacks.
- `src/config/redis.ts`, `src/config/cloudinary.ts` — optional integrations; services that depend on an unconfigured one should throw a `503` (see `getStripe()` pattern in the payment service) rather than crash.
- `src/app/builder/QueryBuilder.ts` — the pagination/filter/sort/search primitive used by every list endpoint. Construct with the raw `req.query`, then chain `.searchable([...])` / `.sortable([...])` to whitelist which fields can be searched/ordered (prevents arbitrary-column injection), `.filter(field, value)` for exact-match filters, and read back `.where()`, `.orderBy()`, `.pagination()`, `.buildMeta(total)`. Soft-deleted rows (`isDeleted`) are excluded by default.
- `src/app/errors/` — `AppError` (statusCode + message) is the only error type application code should throw; `globalErrorHandler` (registered last in `src/app.ts`) maps `AppError`, Zod errors (400), Prisma `P2002` unique-constraint violations (409), and malformed JSON (400) to the standard error envelope, falling back to 500.
- `src/app/utils/sendResponse.ts` — `sendSuccess`/`sendError` produce the standard `{ success, message, meta?, data }` / `{ success, message, errors }` envelope. Always use these instead of calling `res.json` directly.
- `src/app/utils/catchAsync.ts` — wrap every async controller/service handler passed to Express so rejected promises reach `globalErrorHandler`.
- `src/app/utils/audit.ts` — `logAudit(...)` writes to the `AuditLog` table; it's transaction-aware (accepts an optional `tx` client), so calls inside a `prisma.$transaction` pass `tx` to keep the audit entry atomic with the mutation it records.
- `src/app/middlewares/auth.ts` — `authenticate` (verifies JWT, attaches `req.user`) + `authorizeRoles(...roles)`. Every protected route composes these two explicitly; there is no implicit global auth.
- `src/app/middlewares/validateRequest.ts` — wraps a Zod schema; apply to every `POST`/`PATCH`/`PUT` route before the controller.

### Data model (`prisma/schema.prisma`)

Core models: `User`, `Hub`, `Parcel`, `ParcelStatusHistory`, `Payment`, `AuditLog`. `User`/`Hub`/`Parcel`/`Payment` use soft deletes (`isDeleted`, default `false`) — never hard-delete through the API; the `QueryBuilder` and services filter these out by default.

Parcel lifecycle (enforced by a strict transition whitelist in the parcel service, not just the schema):
```
PENDING → ACCEPTED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
                                                              (+ CANCELLED before terminal states)
```
`PENDING → ACCEPTED` happens either via admin assignment or the payment webhook. Parcel `fee` is always computed server-side (base + weight×rate + zone surcharge derived from origin/destination `Hub.zoneCode`) — never trust a client-supplied fee.

Business-critical flows are wrapped in `prisma.$transaction` together with their `ParcelStatusHistory`/`AuditLog` writes: parcel creation, the Stripe webhook (`Payment → PAID` + `Parcel → ACCEPTED` atomically, and idempotent — duplicate webhook deliveries are guarded against), courier assignment, status updates, hub create/update/delete, and user role changes.

### Auth

JWT access + refresh tokens (`src/app/utils/jwtHelpers.ts`), bcrypt password hashing, optional Google login via `google-auth-library` ID-token verification (upserts the user, defaults to `CUSTOMER` on first login). Role checks are per-route (`authenticate, authorizeRoles(Role.X)`), never inferred implicitly.

### Request/response conventions

- All list endpoints share the same query params: `page`, `limit` (max 100), `sortBy`, `sortOrder`, `search`, plus endpoint-specific exact-match filters — implemented via `QueryBuilder`.
- Success responses: `{ success: true, message, meta?, data }` (`meta` only on list endpoints). Error responses: `{ success: false, message, errors? }`.
- The Stripe webhook route (`/api/v1/payments/webhook`) needs the **raw** request body for signature verification; its `express.raw()` body parser is registered in `src/app.ts` *before* the global `express.json()` parser and is also exempted from the global rate limiter — keep that ordering if touching `src/app.ts`.

## Environment

Env vars are validated with Zod in `src/config/index.ts` — add new vars to `envSchema` there (and `.env.example`) rather than reading `process.env` directly elsewhere. `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` are required; Google/Stripe/Cloudinary vars are optional, and the corresponding endpoints return `503` when unconfigured.
