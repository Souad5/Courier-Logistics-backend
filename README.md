# B7A6 Courier & Logistics Management Platform API

A production-grade, backend-only REST API for a courier and logistics management platform. It powers the complete parcel lifecycle — from creation and payment to courier assignment, tracking, and delivery — behind a strict, role-based access control system.

Built with Node.js, TypeScript, Express, PostgreSQL, and Prisma — designed to be tested via Postman/Thunder Client and deployed to Vercel or Render.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Roles & Permission Model](#roles--permission-model)
- [Core Domain Workflow](#core-domain-workflow)
- [API Conventions](#api-conventions)
  - [Response Envelope](#response-envelope)
  - [Authentication](#authentication)
  - [Pagination & Filtering](#pagination--filtering)
  - [Soft Deletes](#soft-deletes)
  - [Transactions](#transactions)
  - [Error Handling](#error-handling)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Database Setup & Seeding](#database-setup--seeding)
  - [Running the Server](#running-the-server)
- [API Reference](#api-reference)
  - [Auth](#1-auth-apiv1auth)
  - [Users](#2-users-apiv1users)
  - [Hubs](#3-hubs-apiv1hubs)
  - [Parcels](#4-parcels-apiv1parcels)
  - [Payments](#5-payments-apiv1payments)
  - [Admin](#6-admin-apiv1admin)
- [Worked End-to-End Example](#worked-end-to-end-example)
- [Testing with Postman](#testing-with-postman)
- [Stripe Webhooks Locally](#stripe-webhooks-locally)
- [Scripts](#scripts)
- [Deployment](#deployment)
  - [Vercel (Serverless)](#vercel-serverless)
  - [Render](#render)
- [Project Structure](#project-structure)
- [License](#license)

---

## Features

- **3 strict roles** (`CUSTOMER`, `COURIER`, `ADMIN`) enforced at the route level — not just in the model.
- **Full parcel lifecycle**: create → pay → assign → pick up → transit → deliver, with a cancellation branch.
- **Zone + weight based pricing** — parcel fees are computed server-side, never trusted from the client.
- **Real payment integration** with Stripe Checkout sessions and signature-verified webhooks that atomically update payment + parcel state.
- **Google social login** via GCP OAuth ID-token verification (`google-auth-library`).
- **JWT authentication** with separate access and refresh tokens.
- **Consistent JSON envelope** for every response, including pagination metadata.
- **Layered architecture** (`Routes → Controllers → Services → Prisma`) — controllers contain no business logic.
- **Reusable QueryBuilder** for pagination, filtering, sorting, and case-insensitive search across every list endpoint.
- **Soft deletes** (`isDeleted`) on all primary models instead of destructive removals.
- **Audit logging** of critical actions (auth, role changes, parcel lifecycle, payments, hub management) inside the same DB transactions.
- **Centralized error handling** with tailored `AppError`, Zod, and Prisma error parsers.
- **Zod validation** on every `POST` / `PATCH` / `PUT` request.
- **Security hardening**: `helmet`, CORS, `express-rate-limit`, bcrypt password hashing.
- **Optional Redis** integration for caching.
- **Cloudinary** upload helper for parcel/images.

---

## Tech Stack

| Layer        | Technology                                                        |
| ------------ | ----------------------------------------------------------------- |
| Runtime      | Node.js, TypeScript, Express 5                                    |
| Database     | PostgreSQL + Prisma ORM (relations, constraints, indexes, transactions) |
| Validation   | Zod                                                               |
| Auth         | JWT (access + refresh), bcrypt, Google OAuth (`google-auth-library`) |
| Payments     | Stripe (Checkout sessions + webhooks)                             |
| Caching      | Redis (optional, via `ioredis`)                                   |
| Uploads      | Multer + Cloudinary                                               |
| Security     | helmet, cors, express-rate-limit                                  |
| Static check | Biome (lint + format)                                             |
| Deploy       | Vercel (serverless) or Render (long-running)                      |

---

## Architecture

The codebase follows a **feature-first layered architecture**. Every domain module owns its interface, validation, service, controller, and route; cross-cutting concerns live in shared folders.

```text
src/
├── @types/                    # Express.Request type augmentation
├── config/
│   ├── index.ts               # Zod-validated env + singleton Prisma client
│   ├── redis.ts               # Optional Redis cache helpers
│   └── cloudinary.ts          # Cloudinary config + upload helper
├── app/
│   ├── builder/
│   │   └── QueryBuilder.ts    # Pagination / filter / sort / search
│   ├── errors/
│   │   ├── AppError.ts
│   │   ├── handleZodError.ts
│   │   └── globalErrorHandler.ts
│   ├── middlewares/
│   │   ├── auth.ts            # authenticate + authorizeRoles
│   │   ├── validateRequest.ts # Zod validation middleware
│   │   └── rateLimiter.ts
│   ├── utils/
│   │   ├── sendResponse.ts    # Response envelope helpers
│   │   ├── jwtHelpers.ts
│   │   ├── catchAsync.ts
│   │   └── audit.ts           # Audit log writer (transaction-aware)
│   ├── routes/
│   │   └── index.ts           # Versioned /api/v1 router
│   └── modules/
│       ├── auth/              # register, login, Google login, refresh
│       ├── user/              # profile + admin user/role management
│       ├── hub/               # zone management
│       ├── parcel/            # core domain & lifecycle
│       ├── payment/           # Stripe checkout + webhook
│       └── auditLog/          # admin reports + audit history
├── app.ts                     # Express bootstrap
└── server.ts                  # Local entrypoint
api/
└── index.ts                   # Vercel serverless handler
prisma/
├── schema.prisma
└── seed.ts
```

**Design rules**

- Controllers are thin — they parse the request and delegate to services.
- Services hold all business logic and wrap mutating flows in `prisma.$transaction`.
- No business logic leaks into routers; routes only wire middleware + controllers.
- Every write is validated by `validateRequest(schema)` before reaching the controller.

---

## Roles & Permission Model

| Role       | Can do                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| `CUSTOMER` | Create parcels, pay via Stripe, list/track own parcels, manage own profile |
| `COURIER`  | View parcels assigned to them, update lifecycle status (`ACCEPTED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`) |
| `ADMIN`    | Manage users (incl. role changes), hubs, parcels and reassignments, view global analytics and audit logs |

Role checks are enforced **per route** with `authenticate` + `authorizeRoles(...)`.

| Permission                    | Middleware applied                          |
| ----------------------------- | ------------------------------------------- |
| Any authenticated user        | `authenticate`                              |
| Customer-only                 | `authenticate, authorizeRoles(Role.CUSTOMER)` |
| Courier-only                  | `authenticate, authorizeRoles(Role.COURIER)`  |
| Admin-only                    | `authenticate, authorizeRoles(Role.ADMIN)`    |

---

## Core Domain Workflow

```text
Customer creates parcel (fee = base + weight×rate + zone surcharges)
        │
        ▼
Customer pays via Stripe Checkout ──► webhook atomically marks Payment PAID
        │                              and Parcel ACCEPTED
        ▼
Admin assigns Courier (+ destination hub)  ──►  Parcel → ACCEPTED
        │
        ▼
Courier lifecycle:  ACCEPTED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
        │
        └────────────────────────►  CANCELLED (before terminal states)
```

Invalid state transitions (e.g. `PENDING → DELIVERED`) are rejected by the service layer.

---

## API Conventions

### Response Envelope

Every endpoint returns one of two shapes.

**Success**

```json
{
  "success": true,
  "message": "Parcels fetched successfully.",
  "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 },
  "data": { }
}
```

> `meta` is present on **list** endpoints. Single-resource endpoints omit it.

**Error**

```json
{
  "success": false,
  "message": "Validation failed.",
  "errors": [
    { "path": "email", "message": "Invalid email address" },
    { "path": "password", "message": "Password must be at least 8 characters" }
  ]
}
```

### Authentication

All protected routes require a JWT bearer token:

```http
Authorization: Bearer <accessToken>
```

- `POST /api/v1/auth/login` and `/register` return `{ accessToken, refreshToken }`.
- When the access token expires, exchange the refresh token at `POST /api/v1/auth/refresh-token`.
- Google login accepts a GCP-signed Google **ID token** at `POST /api/v1/auth/google-login`.

### Pagination & Filtering

Shared query parameters on every list endpoint:

| Param        | Type     | Default     | Description                                  |
| ------------ | -------- | ----------- | -------------------------------------------- |
| `page`       | `number` | `1`         | 1-based page index                           |
| `limit`      | `number` | `10`        | Results per page (max `100`)                 |
| `sortBy`     | `string` | `createdAt` | Sort field (whitelist enforced per endpoint) |
| `sortOrder`  | `asc|desc` | `desc`    | Sort direction                               |
| `search`     | `string` | —           | Case-insensitive partial search               |

Endpoint-specific filters (e.g. `status`, `role`, `zone`) are documented in the API reference.

### Soft Deletes

`User`, `Hub`, `Parcel`, and `Payment` use `isDeleted` flags. Deleted records are excluded from all queries and can be restored later. No record is ever hard-deleted through the API.

### Transactions

Business-critical flows are wrapped in `prisma.$transaction`:

- Parcel creation (parcel + initial status history + audit log)
- Payment webhook (Payment → `PAID` + Parcel → `ACCEPTED` + status history + audit)
- Courier assignment, status updates, and hub updates/deletes
- User role changes

### Error Handling

Errors are centralized in `globalErrorHandler` and mapped to consistent status codes:

| Status | Meaning                                  | Common cases                                        |
| ------ | ---------------------------------------- | --------------------------------------------------- |
| `400`  | Bad request / validation                 | Zod validation failures, invalid state transitions  |
| `401`  | Unauthenticated                          | Missing/expired/invalid token, bad credentials      |
| `403`  | Forbidden                                | Wrong role, non-assigned courier, not parcel owner  |
| `404`  | Not found                                | Unknown route, missing hub/parcel/payment/user      |
| `409`  | Conflict                                 | Duplicate email/code, payment already completed     |
| `500`  | Internal server error                    | Unexpected failures (never leaks details in prod)   |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18 (tested on Node 24)
- **PostgreSQL** ≥ 14 (running locally or accessible remotely)
- Optional: **Redis** (`redis-server`), **Stripe** test keys, **Google OAuth** client, **Cloudinary** account

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Souad5/Courier-Logistics-backend.git
cd courier-backend

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env
```

Then open `.env` and fill in real values (see the table below).

### Environment Variables

| Variable                    | Required | Description                                             |
| --------------------------- | -------- | ------------------------------------------------------- |
| `NODE_ENV`                  | no       | `development` \| `test` \| `production` (default dev)   |
| `PORT`                      | no       | API port (default `5000`)                               |
| `DATABASE_URL`              | **yes**  | PostgreSQL connection string                            |
| `JWT_SECRET`                | **yes**  | Secret for access tokens                                |
| `JWT_EXPIRES_IN`            | no       | Access token lifetime (default `7d`)                    |
| `JWT_REFRESH_SECRET`        | **yes**  | Secret for refresh tokens                               |
| `JWT_REFRESH_EXPIRES_IN`    | no       | Refresh token lifetime (default `30d`)                  |
| `GOOGLE_CLIENT_ID`          | no*      | Google OAuth 2.0 client ID (required for google-login)  |
| `GOOGLE_CLIENT_SECRET`      | no*      | Google OAuth client secret                              |
| `STRIPE_SECRET_KEY`         | no*      | Stripe secret key (required for payments)               |
| `STRIPE_PUBLISHABLE_KEY`    | no       | Stripe publishable key                                  |
| `STRIPE_WEBHOOK_SECRET`     | no*      | Stripe webhook signing secret (required for webhook)    |
| `CLOUDINARY_CLOUD_NAME`     | no*      | Cloudinary cloud name                                   |
| `CLOUDINARY_API_KEY`        | no*      | Cloudinary API key                                      |
| `CLOUDINARY_API_SECRET`     | no*      | Cloudinary API secret                                   |
| `REDIS_URL`                 | no       | Redis connection string (optional caching)              |
| `CLIENT_URL`                | no       | Allowed CORS origin(s), comma-separated                 |

\* Endpoints that depend on an unconfigured optional service return `503 Service Unavailable` with a clear message.

> **Security:** never commit real secrets. `.env` is already git-ignored.

### Database Setup & Seeding

```bash
# Generate the Prisma client
npm run prisma:generate

# Create and apply the initial migration
npm run prisma:migrate          # interactive: name it e.g. "init"

# (or for a non-interactive prod-style apply)
npm run prisma:migrate:prod

# Seed demo data: 1 admin, 2 couriers, 2 customers, 3 hubs, 5 parcels
npm run seed

# Optional: inspect data in Prisma Studio
npm run prisma:studio
```

The seed creates five demo accounts (all password is `Password@123`):

| Role     | Email                | Password      |
| -------- | -------------------- | ------------- |
| Admin    | `admin@courier.com`    | `Password@123` |
| Courier  | `courier1@courier.com` | `Password@123` |
| Courier  | `courier2@courier.com` | `Password@123` |
| Customer | `customer1@courier.com`| `Password@123` |
| Customer | `customer2@courier.com`| `Password@123` |

### Running the Server

```bash
npm run dev        # development (hot reload) → http://localhost:5000

# or production-style:
npm run build
npm start
```

Verify it's up:

```bash
curl http://localhost:5000/api/v1/health
```

```json
{ "success": true, "message": "Courier & Logistics API is healthy", "data": { "status": "OK" } }
```

---

## API Reference

Base URL: `http://localhost:5000/api/v1`

### 1. Auth (`/api/v1/auth`)

#### `POST /auth/register` — Register a Customer or Courier

```json
{
  "name": "Alice Rahman",
  "email": "alice@example.com",
  "password": "StrongPass123",
  "phone": "+8801711111111",
  "role": "CUSTOMER"
}
```

`role` may only be `CUSTOMER` or `COURIER` (defaults to `CUSTOMER`). Admin accounts cannot self-register.

**Response `201`**

```json
{
  "success": true,
  "message": "Account created successfully. Please verify your email.",
  "data": {
    "user": { "id": "…", "email": "alice@example.com", "role": "CUSTOMER", "…": "…" },
    "tokens": { "accessToken": "…", "refreshToken": "…" }
  }
}
```

#### `POST /auth/login` — Password login

```json
{ "email": "customer1@courier.com", "password": "Password@123" }
```

Returns the user and `{ accessToken, refreshToken }`.

#### `POST /auth/google-login` — Google ID-token verification

```json
{ "idToken": "<GCP-signed Google ID token>" }
```

Verifies the token with the configured `GOOGLE_CLIENT_ID` and upserts the user. First-time Google users default to `CUSTOMER`.

#### `POST /auth/refresh-token` — Renew the access token

```json
{ "refreshToken": "<refreshToken>" }
```

Returns a fresh `{ accessToken }`.

---

### 2. Users (`/api/v1/users`)

#### `GET /users/me` — Current profile *(any authenticated role)*

#### `PATCH /users/me` — Update profile *(any authenticated role)*

```json
{ "name": "Alice R.", "phone": "+8801700000000", "avatarUrl": "https://…" }
```

#### `GET /users` — List all users *(Admin)*

Query params: `page`, `limit`, `sortBy`, `sortOrder`, `search`, `role`.

```http
GET /api/v1/users?page=1&limit=10&role=COURIER&search=rahim
```

#### `PATCH /users/:id/role` — Change a user's role *(Admin)*

```json
{ "role": "COURIER" }
```

---

### 3. Hubs (`/api/v1/hubs`)

#### `POST /hubs` — Create a hub/zone *(Admin)*

```json
{
  "name": "Gulshan Hub",
  "code": "HUB-GLS",
  "zoneCode": "inner-city",
  "zoneName": "Inner City",
  "address": "12 Gulshan Avenue",
  "city": "Dhaka",
  "lat": 23.8,
  "lng": 90.4
}
```

`zoneCode` drives zone-based parcel pricing.

#### `GET /hubs` — List active hubs *(public)*

Query params: `page`, `limit`, `search` (name/zone), `zone` (zoneCode), `city`.

#### `PATCH /hubs/:id` — Update hub details *(Admin)*

Accepts any subset of the create payload.

#### `DELETE /hubs/:id` — Soft-delete a hub *(Admin)*

`409 Conflict` if any active parcel is currently routed to that hub.

---

### 4. Parcels (`/api/v1/parcels`)

#### `POST /parcels` — Create a parcel *(Customer)*

The fee is computed server-side from weight and the two hubs' zones:

```json
{
  "type": "PARCEL",
  "weightKg": 2.5,
  "dimensions": "30x20x15",
  "originHubId": "<hub-uuid>",
  "destinationHubId": "<hub-uuid>",
  "senderName": "Alice Rahman",
  "senderPhone": "+8801711111111",
  "senderAddress": "House 5, Road 7, Dhanmondi",
  "senderCity": "Dhaka",
  "receiverName": "Carla Gomes",
  "receiverPhone": "+8801711111112",
  "receiverAddress": "22 Agrabad C/A",
  "receiverCity": "Chattogram",
  "notes": "Call before delivery"
}
```

`type` ∈ `DOCUMENT | PARCEL | FRAGILE | PERISHABLE`.

**Response `201`** — includes the computed `fee`, `trackingNumber`, and `status: PENDING`.

```json
{
  "success": true,
  "message": "Parcel created successfully. Proceed to payment to activate shipping.",
  "data": {
    "parcel": {
      "trackingNumber": "BCM1A2B3C4D",
      "fee": 252.5,
      "currency": "BDT",
      "status": "PENDING",
      "…": "…"
    }
  }
}
```

#### `GET /parcels` — List all parcels *(Admin)*

Query params: `page`, `limit`, `sortBy`, `sortOrder`, `search` (tracking/receiver/sender), `status`, `type`, `courierId`, `senderId`, `originHubId`, `destinationHubId`.

#### `GET /parcels/my-parcels` — Own/assigned parcels *(Customer or Courier)*

- `CUSTOMER` → parcels where `senderId = me`
- `COURIER` → parcels where `courierId = me`

#### `GET /parcels/track/:trackingNumber` — Public tracking view

No authentication required. Returns the latest status plus the last 10 status-history entries.

```http
GET /api/v1/parcels/track/BCM1A2B3C4D
```

#### `PATCH /parcels/:id/assign` — Assign courier *(Admin)*

```json
{ "courierId": "<courier-uuid>", "destinationHubId": "<hub-uuid>" }
```

Validates the user is actually a `COURIER`. If the parcel is still `PENDING`, it moves to `ACCEPTED`.

#### `PATCH /parcels/:id/status` — Update lifecycle status *(Courier or Admin)*

```json
{ "status": "PICKED_UP", "location": "Gulshan Hub", "note": "Parcel collected" }
```

Allowed transitions:

```text
ACCEPTED       → PICKED_UP | CANCELLED
PICKED_UP      → IN_TRANSIT | CANCELLED
IN_TRANSIT     → OUT_FOR_DELIVERY | CANCELLED
OUT_FOR_DELIVERY → DELIVERED
```

A `COURIER` may only update parcels assigned to them. Delivering sets `deliveredAt`; cancelling sets `cancelledAt`.

#### `DELETE /parcels/:id` — Soft-delete a parcel

- **Admin** may delete any parcel.
- **Sender** may only delete their own parcel while it is still `PENDING`.

---

### 5. Payments (`/api/v1/payments`)

#### `POST /payments/initiate` — Start Stripe Checkout *(Customer)*

```json
{
  "parcelId": "<parcel-uuid>",
  "successUrl": "http://localhost:3000/success",
  "cancelUrl": "http://localhost:3000/cancel"
}
```

Returns `{ checkoutUrl, sessionId, payment }`. Redirect the browser to `checkoutUrl`.

#### `POST /payments/webhook` — Stripe webhook *(Stripe → your server)*

Raw-body endpoint (exempt from global rate limiting). Verifies the `Stripe-Signature` header against `STRIPE_WEBHOOK_SECRET`, then **atomically**:

1. Marks the `Payment` as `PAID`
2. Moves the `Parcel` from `PENDING` → `ACCEPTED`
3. Records a status-history entry and an audit log

The handler is idempotent — duplicate notifications are safely ignored.

#### `GET /payments/:id` — Fetch payment details *(owner or Admin)*

---

### 6. Admin (`/api/v1/admin`)

#### `GET /admin/dashboard-stats` — Summary metrics *(Admin)*

Returns total income, customer/courier counts, delivered/pending/cancelled counts, and the full status breakdown.

```json
{
  "success": true,
  "message": "Dashboard statistics fetched successfully.",
  "data": {
    "stats": {
      "totalIncome": 1234.5,
      "totalCustomers": 2,
      "totalCouriers": 2,
      "activeCouriers": 1,
      "totalParcels": 5,
      "deliveredParcels": 1,
      "pendingParcels": 1,
      "cancelledParcels": 1,
      "statusBreakdown": [ { "status": "DELIVERED", "count": 1 } ]
    }
  }
}
```

#### `GET /admin/audit-logs` — Audit history *(Admin)*

Query params: `page`, `limit`, `action`, `entityType`, `entityId`.

---

## Worked End-to-End Example

```bash
# 1. Login as a customer
TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"customer1@courier.com","password":"Password@123"}' \
  | jq -r '.data.tokens.accessToken')

# 2. Find two hubs
curl -s "http://localhost:5000/api/v1/hubs?limit=2" | jq '.data.hubs[].id'

# 3. Create a parcel (fee is computed server-side)
PARCEL=$(curl -s -X POST http://localhost:5000/api/v1/parcels \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"weightKg":2.5,"originHubId":"<origin>","destinationHubId":"<dest>",
       "senderName":"Alice","senderPhone":"+8801711111111","senderAddress":"Dhanmondi, Dhaka",
       "receiverName":"Carla","receiverPhone":"+8801711111112","receiverAddress":"Agrabad, Chattogram"}')

PARCEL_ID=$(echo "$PARCEL" | jq -r '.data.parcel.id')

# 4. Pay via Stripe Checkout
curl -s -X POST http://localhost:5000/api/v1/payments/initiate \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"parcelId\":\"$PARCEL_ID\",\"successUrl\":\"http://localhost:3000/success\",\"cancelUrl\":\"http://localhost:3000/cancel\"}" \
  | jq '.data.checkoutUrl'

# 5. Admin assigns a courier
ADMIN_TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@courier.com","password":"Password@123"}' | jq -r '.data.tokens.accessToken')

curl -s -X PATCH http://localhost:5000/api/v1/parcels/$PARCEL_ID/assign \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"courierId":"<courier-uuid>"}' | jq '.data.parcel.status'   # "ACCEPTED"

# 6. Trace the parcel publicly
curl -s http://localhost:5000/api/v1/parcels/track/BCM1A2B3C4D | jq '.data.status'
```

---

## Testing with Postman

The API ships with **no frontend**; Postman or Thunder Client is the intended client.

1. Create a collection with base URL `http://localhost:5000/api/v1`.
2. Add an environment variable `baseUrl` and a `token` variable.
3. Call **Login** first, then in the collection *Tests* tab:
   ```js
   pm.environment.set("token", pm.response.json().data.tokens.accessToken);
   ```
4. Set the `Authorization` header to `Bearer {{token}}` at the collection level (folder level for non-auth routes).
5. Suggested request order: `register/login → create parcel → initiate payment → assign → update status → track`.

---

## Stripe Webhooks Locally

```bash
# Install the Stripe CLI, then forward webhooks to your local server
stripe listen --forward-to localhost:5000/api/v1/payments/webhook
```

Copy the `whsec_...` signing secret printed by the CLI into `STRIPE_WEBHOOK_SECRET` in `.env`, then complete a checkout in test mode to see `Payment → PAID` and `Parcel → ACCEPTED`.

---

## Scripts

| Command                        | Description                                |
| ------------------------------ | ------------------------------------------ |
| `npm run dev`                  | Start dev server with hot reload (`tsx watch`) |
| `npm run build`                | Compile TypeScript to `dist/`              |
| `npm start`                    | Run the compiled server                    |
| `npm run prisma:generate`      | Generate the Prisma client                 |
| `npm run prisma:migrate`       | Run an interactive dev migration           |
| `npm run prisma:migrate:prod`  | Apply migrations non-interactively         |
| `npm run prisma:studio`        | Open Prisma Studio                         |
| `npm run seed`                 | Seed demo data                             |
| `npm run lint`                 | Biome lint check                           |
| `npm run lint:fix`             | Auto-fix lint issues                       |
| `npm run format`               | Format code with Biome                     |

---

## Deployment

### Vercel (Serverless)

The serverless entrypoint is `api/index.ts`, wired by `vercel.json`.

```bash
# Install Vercel CLI and deploy
npm i -g vercel
vercel
```

Notes:

- The Stripe webhook raw-body parser is registered in `src/app.ts`, so signature verification works under serverless too.
- Set all environment variables (`DATABASE_URL`, `JWT_SECRET`, `STRIPE_*`, `GOOGLE_CLIENT_ID`, …) in the Vercel dashboard.
- Use a managed Postgres (e.g. Neon, Supabase) and a Redis provider (e.g. Upstash) that work well with serverless functions.

### Render

Long-running Node process, simplest for this API.

1. Create a new **Web Service**, connect the repo.
2. **Build command:** `npm install && npm run build && npm run prisma:migrate:prod && npm run seed` (seed once, or in the shell).
3. **Start command:** `npm start`.
4. Add the `.env` values under **Environment**.
5. For webhooks, configure the public URL under **Webhook Settings** for Stripe: `https://<your-service>.onrender.com/api/v1/payments/webhook`.

---

## Project Structure

```text
.
├── api/
│   └── index.ts                 # Vercel serverless handler
├── prisma/
│   ├── schema.prisma            # Models, enums, relations, indexes
│   └── seed.ts                  # Demo data
├── src/
│   ├── @types/                  # Express.Request augmentation
│   ├── config/                  # env, Prisma client, Redis, Cloudinary
│   ├── app/
│   │   ├── builder/             # QueryBuilder
│   │   ├── errors/              # AppError + error parsers
│   │   ├── middlewares/         # auth, roles, validation, rate limiting
│   │   ├── modules/             # auth, user, hub, parcel, payment, auditLog
│   │   ├── routes/              # /api/v1 router
│   │   └── utils/               # response, jwt, catchAsync, audit
│   ├── app.ts                   # Express bootstrap
│   └── server.ts                # Local entrypoint
├── .env.example
├── .gitignore
├── biome.json
├── package.json
├── tsconfig.json
└── vercel.json
```

---

## License

This project was built as part of an academic assignment (**B7A6: Courier & Logistics Management Platform**). Contact the repository owner for usage terms.