import { Role } from "@prisma/client";
import { z } from "zod";

const selfRegisteredRoles = [Role.CUSTOMER, Role.COURIER] as const;

export const registerZodSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  phone: z.string().trim().min(6).max(20).optional(),
  role: z
    .nativeEnum(Role)
    .default(Role.CUSTOMER)
    .refine(
      (role) => selfRegisteredRoles.includes(role as (typeof selfRegisteredRoles)[number]),
      "Self-registration is only allowed for CUSTOMER or COURIER roles.",
    ),
});

export const loginZodSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const googleLoginZodSchema = z.object({
  idToken: z.string().min(10, "Google ID token is required"),
});

export const refreshTokenZodSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export type RegisterInput = z.infer<typeof registerZodSchema>;
export type LoginInput = z.infer<typeof loginZodSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginZodSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenZodSchema>;
