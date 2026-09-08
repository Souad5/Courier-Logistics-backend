import type { NextFunction, Request } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { catchAsync } from "../utils/catchAsync";

interface JwtPayload {
  userId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        name: string;
      };
    }
  }
}

export const protect = catchAsync(async (req: Request, _res, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiError(401, "You are not logged in. Please provide a valid token.");
  }

  const token = header.split(" ")[1];
  if (!token) throw new ApiError(401, "Invalid token.");

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    throw new ApiError(401, "Token is invalid or expired.");
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId, deletedAt: null },
    select: { id: true, email: true, role: true, name: true },
  });

  if (!user) throw new ApiError(401, "User belonging to this token no longer exists.");

  req.user = user;
  next();
});
