import { randomUUID } from "node:crypto";
import type { Role } from "@prisma/client";
import jwt, { type SignOptions } from "jsonwebtoken";

import { env } from "../../config";
import { AppError } from "../errors/AppError";

export interface ITokenPayload {
  userId: string;
  email: string;
  role: Role;
}

/** Refresh tokens carry a unique `jti` so a single token can be revoked (see logoutUser/AppError checks in auth.service) without invalidating every session for the user. */
export interface IRefreshTokenPayload extends ITokenPayload {
  jti: string;
  exp: number;
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
  return jwt.sign({ ...payload, jti: randomUUID() }, env.JWT_REFRESH_SECRET, {
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

export function verifyRefreshToken(token: string): IRefreshTokenPayload {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as IRefreshTokenPayload;
  } catch {
    throw new AppError(401, "Invalid or expired refresh token.");
  }
}
