import type { Response } from "express";

export function sendSuccess<T>(
  res: Response,
  message: string,
  data: T = {} as T,
  statusCode = 200,
): Response {
  return res.status(statusCode).json({ success: true, message, data: data as never });
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  errors: unknown[] = [],
): Response {
  return res.status(statusCode).json({ success: false, message, errors });
}
