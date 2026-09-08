import type { Role } from "@prisma/client";
import jwt, { type SignOptions } from "jsonwebtoken";

import { env } from "../../config";
import { AppError } from "../errors/AppError";

export interface ITokenPayload {
  userId: string;
  email: string;
  role: Role;
}

export interface ITokenPair {
  accessToken: string;
  refreshToken: string;
}

export function signAccessToken(payload: ITokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);
}

export function signRefreshToken(payload: ITokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);
}

export function signTokens(payload: ITokenPayload): ITokenPair {
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export function verifyAccessToken(token: string): ITokenPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as ITokenPayload;
  } catch {
    throw new AppError(401, "Invalid or expired access token.");
  }
}

export function verifyRefreshToken(token: string): ITokenPayload {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as ITokenPayload;
  } catch {
    throw new AppError(401, "Invalid or expired refresh token.");
  }
}
