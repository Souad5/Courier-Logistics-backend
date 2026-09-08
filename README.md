# B7A6 Courier & Logistics Management Platform 🚚

Backend-only REST API for a Courier & Logistics Management Platform.

## Tech Stack

- **Node.js + TypeScript + Express.js**
- **PostgreSQL + Prisma ORM** (relations, constraints, indexing, transactions)
- **Zod** for validation
- **JWT** Bearer auth (Email/Password + Google OAuth)
- **express-rate-limit / helmet / cors**
- **Redis** (optional caching / rate limiting)
- **Multer + Cloudinary** (image upload)
- **Stripe** (real payment integration)
- Deployable on **Render** (long-running) or **Vercel** (serverless)

## Roles (strictly 3)

- **CUSTOMER** – creates shipments, raises pickup requests, pays
- **COURIER** – assigned to shipments, updates status, delivers
- **ADMIN** – hub/ops management, assignment, reporting

## Core Workflow

```
Create Shipment → Pickup Request → Courier Assigned → Picked Up
→ Origin Hub → In Transit / Hub Transfer → Destination Hub
→ Out for Delivery → Delivered
(⬅ Failed Delivery / Return-to-Sender branch)
```

## Project Structure

```
src/
├── config/          # env.ts (Zod-validated), prisma.ts, redis.ts
├── middlewares/     # errorHandler, auth (JWT), roleGuard, validate
├── modules/         # auth, user, shipment, courier, payment, admin, hub
│   └── <module>/    #   routes → controllers → services → prisma
├── routes/          # versioned /api/v1 router
├── utils/           # ApiError, ApiResponse, catchAsync, pagination, auditLogger, cloudinary
├── app.ts           # Express bootstrap
└── server.ts        # local entrypoint
prisma/
├── schema.prisma    # Prisma models, enums, relations, indexes
└── seed.ts          # demo Admin / Customer / Courier
api/
└── index.ts         # Vercel serverless handler
```

## Layered Architecture

Routes → Controllers → Services → Prisma. **No business logic in controllers.**

## Getting Started

### 1. Prerequisites

- Node.js v18+
- PostgreSQL running locally
- (Optional) Redis running locally
- (Optional) Stripe account, Google OAuth app, Cloudinary account

### 2. Install & set env

```bash
npm install
cp .env.example .env   # fill in your values
```

### 3. Database

```bash
npx prisma migrate dev --name init
npm run prisma:generate
npm run seed
```

### 4. Run

```bash
npm run dev        # http://localhost:5000
```

## API Conventions

- **Base path:** `/api/v1/...`
- **Health check:** `GET /api/v1/health`

### Response envelope

```json
// Success
{ "success": true, "message": "...", "data": {} }

// Error
{ "success": false, "message": "...", "errors": [] }
```

### Auth

```bash
GET /api/v1/... -H "Authorization: Bearer <token>"
```

## Scripts

| Command                  | Description                    |
| ------------------------ | ------------------------------ |
| `npm run dev`            | Start dev server (tsx watch)   |
| `npm run build`          | Compile TypeScript             |
| `npm start`              | Run compiled build             |
| `npm run prisma:generate`| Generate Prisma client         |
| `npm run prisma:migrate` | Run dev migration              |
| `npm run seed`           | Seed demo accounts             |
| `npm run lint` / `format`| Biome lint / format            |

## Deployment

- **Vercel:** entrypoint is `api/index.ts` (see `vercel.json`).
- **Render:** `npm run build` then `npm start`; set `DATABASE_URL` and other env vars there.

## Demo Accounts (after seed)

| Role     | Email                 | Password       |
| -------- | --------------------- | -------------- |
| Admin    | admin@courier.com    | Password@123   |
| Customer | customer@courier.com | Password@123   |
| Courier  | courier@courier.com  | Password@123   |
