import cors from "cors";
import express, { type Express } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";
import { apiRouter } from "./routes";

const app: Express = express();

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: env.CLIENT_URL?.split(",") ?? "*",
    credentials: true,
  }),
);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Global rate limiting
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later.", errors: [] },
});
app.use("/api", generalLimiter);

// Versioned routes
app.use("/api/v1", apiRouter);

// Health check at root too (useful for Vercel)
app.get("/health", (_req, res) => {
  res.status(200).json({ success: true, message: "Healthy", data: { status: "OK" } });
});

// 404 + centralized error handler
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
