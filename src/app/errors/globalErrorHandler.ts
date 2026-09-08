import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler } from "express";
import jwt from "jsonwebtoken";
import { ZodError } from "zod";
import { sendError } from "../utils/sendResponse";
import { AppError } from "./AppError";
import { handleZodError } from "./handleZodError";

interface IPrismaErrorMapping {
  statusCode: number;
  message: string;
}

export const globalErrorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let error: AppError;

  if (err instanceof AppError) {
    error = err;
  } else if (err instanceof ZodError) {
    error = handleZodError(err);
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    error = mapPrismaError(err);
  } else if (err instanceof jwt.TokenExpiredError) {
    error = new AppError(401, "Your token has expired. Please login again.");
  } else if (err instanceof jwt.JsonWebTokenError) {
    error = new AppError(401, "Invalid token. Please login again.");
  } else if (err instanceof Error) {
    console.error("💥 Unhandled error:", req.method, req.originalUrl, err);
    error = new AppError(500, "Internal server error. Please try again later.", [], false);
  } else {
    console.error("💥 Unknown error:", err);
    error = new AppError(500, "Internal server error. Please try again later.", [], false);
  }

  if (error.isOperational === false) {
    console.error("💥 Fatal operational failure:", error);
  }

  sendError(res, error.statusCode, error.message, error.details);
};

function mapPrismaError(err: Prisma.PrismaClientKnownRequestError): AppError {
  const mapping: Record<string, IPrismaErrorMapping> = {
    P2000: { statusCode: 400, message: "Provided value is too long for this column." },
    P2002: { statusCode: 409, message: "A record with this unique value already exists." },
    P2003: { statusCode: 400, message: "Related record does not exist (foreign key violation)." },
    P2025: { statusCode: 404, message: "The requested record was not found." },
    P2024: { statusCode: 503, message: "Database connection timeout. Please retry." },
  };

  const mapped = mapping[err.code];
  if (mapped) {
    return new AppError(mapped.statusCode, mapped.message, err.meta ? [err.meta] : []);
  }

  console.error("💥 Prisma error:", err);
  return new AppError(500, "Database error. Please try again later.", [], false);
}
