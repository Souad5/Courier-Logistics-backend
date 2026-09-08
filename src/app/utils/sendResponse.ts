import type { Response } from "express";

export interface IResponseMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ISuccessResponse<T> {
  success: true;
  message: string;
  meta?: IResponseMeta;
  data: T;
}

export interface IErrorResponse {
  success: false;
  message: string;
  errors: unknown[];
}

export function sendSuccess<T>(
  res: Response,
  message: string,
  data: T,
  meta?: IResponseMeta,
  statusCode = 200,
): Response<ISuccessResponse<T>> {
  const body: ISuccessResponse<T> = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  errors: unknown[] = [],
): Response<IErrorResponse> {
  const body: IErrorResponse = { success: false, message, errors };
  return res.status(statusCode).json(body);
}
