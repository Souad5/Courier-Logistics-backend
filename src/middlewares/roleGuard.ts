import type { NextFunction, Request, Response } from "express";

import { ApiError } from "../utils/ApiError";

export type AllowedRoles = "CUSTOMER" | "COURIER" | "ADMIN";

export function restrictTo(...roles: AllowedRoles[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(new ApiError(401, "Authentication required."));

    if (!roles.includes(user.role as AllowedRoles)) {
      return next(new ApiError(403, "You do not have permission to perform this action."));
    }

    next();
  };
}
