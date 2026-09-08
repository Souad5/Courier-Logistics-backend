# B7A6 Courier & Logistics Management Platform 🚚

Backend-only REST API for a Courier & Logistics Management Platform.

## Tech Stack

- **Node.js + TypeScript + Express.js**
- **PostgreSQL + Prisma ORM** (relations, constraints, indexing, transactions)
- **Zod** for strict request validation
- **JWT** Bearer auth (Email/Password + Google ID-token verification via `google-auth-library`)
- **Stripe** checkouts (real payment integration + webhooks)
- **express-rate-limit / helmet / cors**
- **Redis** (optional caching)
- **Multer + Cloudinary** (image upload)
- Deployable on **Render** (long-running) or **Vercel** (serverless)

## Roles (strictly 3 — enforced at the route level)

- **CUSTOMER** – creates parcels, pays, tracks, manages profile
- **COURIER** – updates assigned parcel lifecycle status
- **ADMIN** – full system control (users, hubs, parcels, assignments, analytics, audit logs)

## Core Workflow

```
Create Parcel (fee auto-calculated from weight + zones)
→ Pay via Stripe → Admin assigns Courier + Destination Hub
→ Courier accepts / Picked Up → In Transit → Out for Delivery → Delivered
(⬅ Failed / Cancelled branch)
```

## Directory Structure

```
src/
├── @types/                  # Express.Request augmentation
├── config/                  # env (Zod-validated), Prisma client, Redis, Cloudinary
├── app/
│   ├── builder/             # QueryBuilder (pagination/filter/sort/search)
│   ├── errors/              # AppError, handleZodError, globalErrorHandler
│   ├── middlewares/         # authenticate, authorizeRoles, validateRequest, rateLimiter
│   ├── utils/               # sendResponse, jwtHelpers, catchAsync, audit logger
│   ├── routes/              # versioned /api/v1 router
│   └── modules/             # auth, user, hub, parcel, payment, auditLog
├── app.ts                   # Express bootstrap
└── server.ts                # local entrypoint
api/index.ts                 # Vercel serverless handler
prisma/schema.prisma / seed.ts
```

Each module follows **routes → controllers → services → Prisma**. Controllers contain no business logic.

## API Conventions

- Base path: `/api/v1`
- Response envelope:

```json
// Success (list endpoints include `meta`)
{ "success": true, "message": "...", "meta": { "page": 1, "limit": 10, "total": 100 }, "data": {} }

// Error
{ "success": false, "message": "...", "errors": [ ... ] }
```

- Auth: `Authorization: Bearer <token>`

## Endpoints (22)

### Auth — `/api/v1/auth`
| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| POST | `/register` | Public | Register CUSTOMER/COURIER |
| POST | `/login` | Public | Password login |
| POST | `/google-login` | Public | Google ID-token login |
| POST | `/refresh-token` | Public | Renew access token |

### Users — `/api/v1/users`
| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| GET | `/me` | Any authed | Current profile |
| PATCH | `/me` | Any authed | Update profile |
| GET | `/` | ADMIN | List users (page/limit/role/search) |
| PATCH | `/:id/role` | ADMIN | Update a user's role |

### Hubs — `/api/v1/hubs`
| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| POST | `/` | ADMIN | Create hub/zone |
| GET | `/` | Public | List active hubs (search by zone/name) |
| PATCH | `/:id` | ADMIN | Update hub |
| DELETE | `/:id` | ADMIN | Soft-delete hub |

### Parcels — `/api/v1/parcels`
| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| POST | `/` | CUSTOMER | Create parcel (fee from weight + zone) |
| GET | `/` | ADMIN | List parcels (search/status/hub filters) |
| GET | `/my-parcels` | CUSTOMER/COURIER | Own / assigned parcels |
| GET | `/track/:trackingNumber` | Public | Tracking view + history |
| PATCH | `/:id/assign` | ADMIN | Assign courier + destination hub |
| PATCH | `/:id/status` | COURIER/ADMIN | Update lifecycle status |
| DELETE | `/:id` | Sender/ADMIN | Soft-delete parcel |

### Payments — `/api/v1/payments`
| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| POST | `/initiate` | CUSTOMER | Stripe checkout session |
| POST | `/webhook` | Stripe | Verify payment, update payment+parcel atomically |
| GET | `/:id` | Owner/ADMIN | Payment details |

### Admin — `/api/v1/admin`
| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| GET | `/dashboard-stats` | ADMIN | Income, couriers, parcel status breakdown |
| GET | `/audit-logs` | ADMIN | System audit history |

## Getting Started

```bash
npm install
cp .env.example .env      # fill DATABASE_URL, JWT secrets, etc.

npx prisma migrate dev --name init
npm run seed              # 1 admin, 2 couriers, 2 customers, 3 hubs, 5 parcels

npm run dev               # http://localhost:5000
```

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Dev server (tsx watch) |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled build |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Apply dev migration |
| `npm run seed` | Seed demo data |
| `npm run lint` / `format` | Biome check / format |

## Stripe Webhook (local dev)

```bash
stripe listen --forward-to localhost:5000/api/v1/payments/webhook
# set STRIPE_WEBHOOK_SECRET to the webhook signing secret
```

## Deployment

- **Vercel:** entrypoint `api/index.ts` (see `vercel.json`). The webhook raw-body parser is wired in `app.ts`.
- **Render:** `npm run build` then `npm start`; set all env vars there.

## Demo Accounts (after seed)

| Role | Email | Password |
| ---- | ----- | -------- |
| Admin | admin@courier.com | Password@123 |
| Courier | courier1@courier.com | Password@123 |
| Courier | courier2@courier.com | Password@123 |
| Customer | customer1@courier.com | Password@123 |
| Customer | customer2@courier.com | Password@123 |