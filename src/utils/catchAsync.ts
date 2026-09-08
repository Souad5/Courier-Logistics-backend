import type { Request, RequestHandler, Response } from "express";

type AsyncHandler = (
  req: Request,
  res: Response,
  next: (err?: unknown) => void,
) => Promise<unknown>;

export function catchAsync(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
