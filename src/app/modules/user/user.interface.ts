import type { Role } from "@prisma/client";

export interface IUpdateProfileInput {
  name?: string;
  phone?: string;
  avatarUrl?: string;
}

export interface IUserPayload {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  role: Role;
  status: string;
  isEmailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}
