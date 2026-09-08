import type { ZodError } from "zod";

import { AppError } from "./AppError";

export interface IZodIssueDetail {
  path: string;
  message: string;
}

export function handleZodError(error: ZodError): AppError {
  const details: IZodIssueDetail[] = error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

  return new AppError(400, "Validation failed", details);
}
