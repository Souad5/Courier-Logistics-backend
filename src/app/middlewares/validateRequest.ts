import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

import { AppError } from "../errors/AppError";

type ValidationSource = "body" | "query" | "params";

/**
 * Validates a request segment against a Zod schema before it reaches
 * the controller/service layer. Rejects with the standard error envelope.
 */
export const validateRequest =
  (schema: ZodType, source: ValidationSource = "body") =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      next(new AppError(400, "Validation failed.", details));
      return;
    }

    Object.assign(req[source] as Record<string, unknown>, result.data);
    next();
  };
