import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { AppError } from "./app/errors/AppError";
import { globalErrorHandler } from "./app/errors/globalErrorHandler";
import { apiRateLimiter } from "./app/middlewares/rateLimiter";
import { apiRoutes } from "./app/routes";
import { sendSuccess } from "./app/utils/sendResponse";
import { env } from "./config";

const app: Express = express();

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: env.CLIENT_URL ? env.CLIENT_URL.split(",") : "*",
    credentials: true,
  }),
);

// Stripe webhook must receive the RAW body (Buffer) to verify signatures.
app.use(
  "/api/v1/payments/webhook",
  express.raw({ type: ["application/json", "application/x-www-form-urlencoded"] }),
);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Global rate limiting
app.use("/api", apiRateLimiter);

// Root info and health checks
app.get("/", (_req, res) => {
  sendSuccess(res, "Courier & Logistics Management Platform API", {
    version: "v1",
    baseUrl: "/api/v1",
    modules: ["auth", "users", "hubs", "parcels", "payments", "admin"],
  });
});

app.get("/health", (_req, res) => {
  sendSuccess(res, "Courier & Logistics API is healthy", { status: "OK", env: env.NODE_ENV });
});

// Versioned API routes
app.use("/api/v1", apiRoutes);

// 404 catch-all
app.use((req, _res, next) => {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
});

// Centralized error handler (must be last)
app.use(globalErrorHandler);

export { app };
