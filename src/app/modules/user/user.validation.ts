import { Role } from "@prisma/client";
import { z } from "zod";

export const updateProfileZodSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  phone: z.string().trim().min(6).max(20).optional(),
  avatarUrl: z.string().url().optional(),
});

export const updateRoleZodSchema = z.object({
  role: z.nativeEnum(Role),
});

export type UpdateProfileInput = z.infer<typeof updateProfileZodSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleZodSchema>;
