import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

import { ApiError } from "../utils/ApiError";

type Source = "body" | "query" | "params";

export function validate(schema: ZodSchema, source: Source = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new ApiError(422, "Validation failed", result.error.issues));
    }
    req[source] = result.data as never;
    next();
  };
}
