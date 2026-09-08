import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { sendError } from "../utils/ApiResponse";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let statusCode = 500;
  let message = "Internal Server Error";
  let errors: unknown[] = [];

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err instanceof ZodError) {
    statusCode = 422;
    message = "Validation failed";
    errors = err.issues.map((e) => ({ path: e.path.join("."), message: e.message }));
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      statusCode = 409;
      message = "Duplicate field value: a record with this value already exists.";
      errors = err.meta ? [err.meta] : [];
    } else if (err.code === "P2025") {
      statusCode = 404;
      message = "Record not found.";
    } else {
      message = "Database error";
    }
  } else if (err instanceof Error) {
    message = err.message;
  }

  // Don't leak internal details in production
  const detailedMessage = env.NODE_ENV === "production" && statusCode === 500 ? message : message;

  if (statusCode === 500) {
    console.error("💥 Unhandled error:", err);
  }

  sendError(res, statusCode, detailedMessage, errors);
}
