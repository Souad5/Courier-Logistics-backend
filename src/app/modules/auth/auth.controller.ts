import type { Request, Response } from "express";

import { catchAsync } from "../../utils/catchAsync";
import { sendSuccess } from "../../utils/sendResponse";
import { googleLoginUser, loginUser, refreshAccessToken, registerUser } from "./auth.service";
import type {
  GoogleLoginInput,
  LoginInput,
  RefreshTokenInput,
  RegisterInput,
} from "./auth.validation";

export const register = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as RegisterInput;
  const result = await registerUser({
    name: body.name,
    email: body.email,
    password: body.password,
    phone: body.phone,
    role: body.role,
  });

  sendSuccess(
    res,
    "Account created successfully. Please verify your email.",
    result,
    undefined,
    201,
  );
});

export const login = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as LoginInput;
  const result = await loginUser(body);

  sendSuccess(res, "Login successful.", result, undefined, 200);
});

export const googleLogin = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as GoogleLoginInput;
  const result = await googleLoginUser(body);

  sendSuccess(res, "Google login successful.", result, undefined, 200);
});

export const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as RefreshTokenInput;
  const result = await refreshAccessToken(body);

  sendSuccess(res, "Access token refreshed successfully.", result, undefined, 200);
});
