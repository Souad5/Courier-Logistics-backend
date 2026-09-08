import type { AuthProvider, Role, UserStatus } from "@prisma/client";

import type { ITokenPair } from "../../utils/jwtHelpers";

export interface IRegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role?: Role;
}

export interface ILoginInput {
  email: string;
  password: string;
}

export interface IGoogleLoginInput {
  idToken: string;
}

export interface IRefreshTokenInput {
  refreshToken: string;
}

export interface IAuthUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  role: Role;
  status: UserStatus;
  provider: AuthProvider;
  isEmailVerified: boolean;
  createdAt: Date;
}

export interface IAuthResult {
  user: IAuthUser;
  tokens: ITokenPair;
}
