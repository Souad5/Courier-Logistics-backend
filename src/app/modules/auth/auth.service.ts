import { AuthProvider, Prisma, Role, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";

import { env, prisma } from "../../../config";
import { AppError } from "../../errors/AppError";
import { logAudit } from "../../utils/audit";
import { signAccessToken, signTokens, verifyRefreshToken } from "../../utils/jwtHelpers";
import type { IAuthResult, IAuthUser } from "./auth.interface";

const SALT_ROUNDS = 12;

function sanitizeUser(user: User): IAuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    provider: user.provider,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
  };
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: Role;
}): Promise<IAuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) throw new AppError(409, "An account with this email already exists.");

  const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS);

  let user: User;
  try {
    user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name.trim(),
        phone: input.phone,
        password: hashedPassword,
        role: input.role,
        provider: AuthProvider.LOCAL,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "An account with this email already exists.");
    }
    throw error;
  }

  const tokens = signTokens({ userId: user.id, email: user.email, role: user.role });

  await logAudit({
    action: "REGISTER",
    actorId: user.id,
    entityType: "User",
    entityId: user.id,
    newValue: { email: user.email, role: user.role },
  });

  return { user: sanitizeUser(user), tokens };
}

export async function loginUser(input: { email: string; password: string }): Promise<IAuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user?.password) throw new AppError(401, "Invalid email or password.");

  const isMatch = await bcrypt.compare(input.password, user.password);
  if (!isMatch) throw new AppError(401, "Invalid email or password.");

  if (user.status !== "ACTIVE") {
    throw new AppError(403, "Your account is not active. Please contact support.");
  }

  const tokens = signTokens({ userId: user.id, email: user.email, role: user.role });

  await logAudit({
    action: "LOGIN",
    actorId: user.id,
    entityType: "User",
    entityId: user.id,
  });

  return { user: sanitizeUser(user), tokens };
}

export async function googleLoginUser(input: { idToken: string }): Promise<IAuthResult> {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new AppError(503, "Google OAuth is not configured on this server.");
  }

  const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  const ticket = await client.verifyIdToken({
    idToken: input.idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload?.email) {
    throw new AppError(401, "Could not read email from Google token.");
  }

  const email = payload.email.toLowerCase();
  const googleId = payload.sub;

  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        googleId,
        name: payload.name ?? email.split("@")[0],
        avatarUrl: payload.picture ?? null,
        role: Role.CUSTOMER,
        provider: AuthProvider.GOOGLE,
        isEmailVerified: payload.email_verified ?? false,
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        googleId: user.googleId ?? googleId,
        provider: user.provider === AuthProvider.LOCAL ? AuthProvider.GOOGLE : user.provider,
        avatarUrl: user.avatarUrl ?? payload.picture ?? null,
        isEmailVerified: user.isEmailVerified || (payload.email_verified ?? false),
      },
    });
  }

  if (user.status !== "ACTIVE") {
    throw new AppError(403, "Your account is not active. Please contact support.");
  }

  const tokens = signTokens({ userId: user.id, email: user.email, role: user.role });

  await logAudit({
    action: "GOOGLE_LOGIN",
    actorId: user.id,
    entityType: "User",
    entityId: user.id,
    metadata: { freshAccount: user.createdAt.getTime() === user.updatedAt.getTime() },
  });

  return { user: sanitizeUser(user), tokens };
}

export async function refreshAccessToken(input: {
  refreshToken: string;
}): Promise<{ accessToken: string }> {
  const payload = verifyRefreshToken(input.refreshToken);

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, role: true, isDeleted: true, status: true },
  });

  if (!user || user.isDeleted || user.status !== "ACTIVE") {
    throw new AppError(401, "The user for this token is no longer active.");
  }

  return { accessToken: signAccessToken({ userId: user.id, email: user.email, role: user.role }) };
}
