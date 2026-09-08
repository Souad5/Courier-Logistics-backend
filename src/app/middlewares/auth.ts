import type { Role, UserStatus } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";

import { prisma } from "../../config";
import { AppError } from "../errors/AppError";
import { catchAsync } from "../utils/catchAsync";
import { verifyAccessToken } from "../utils/jwtHelpers";

export interface IAuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
}

/** JWT Bearer authentication. Attaches the current user to `req.user`. */
export const authenticate = catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    throw new AppError(401, "You are not logged in. Please provide a Bearer token.");
  }

  const token = header.slice(7).trim();
  if (!token) throw new AppError(401, "Invalid token.");

  const payload = verifyAccessToken(token);

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, role: true, status: true, isDeleted: true },
  });

  if (!user || user.isDeleted) {
    throw new AppError(401, "The user belonging to this token no longer exists.");
  }

  req.user = user;
  next();
});

/** Role-based access control, applied after authenticate. */
export const authorizeRoles =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      next(new AppError(401, "Authentication required."));
      return;
    }

    if (!roles.includes(user.role)) {
      next(new AppError(403, "You do not have permission to perform this action."));
      return;
    }

    next();
  };
