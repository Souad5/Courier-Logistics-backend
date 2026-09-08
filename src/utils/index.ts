import type { RequestHandler } from "express";

import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { sendSuccess } from "../utils/ApiResponse";
import { catchAsync } from "../utils/catchAsync";

export const healthCheck: RequestHandler = catchAsync(async (_req, res) => {
  sendSuccess(res, "Courier & Logistics API is healthy", {
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  });
});

export const passthrough: RequestHandler = (_req, _res, next) => next();

export { ApiError };
