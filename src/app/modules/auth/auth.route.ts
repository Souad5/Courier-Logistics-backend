import { Router } from "express";
import { authRateLimiter } from "../../middlewares/rateLimiter";
import { validateRequest } from "../../middlewares/validateRequest";
import * as authController from "./auth.controller";
import {
  googleLoginZodSchema,
  loginZodSchema,
  refreshTokenZodSchema,
  registerZodSchema,
} from "./auth.validation";

export const authRoutes = Router();

authRoutes.post(
  "/register",
  authRateLimiter,
  validateRequest(registerZodSchema),
  authController.register,
);
authRoutes.post("/login", authRateLimiter, validateRequest(loginZodSchema), authController.login);
authRoutes.post(
  "/google-login",
  authRateLimiter,
  validateRequest(googleLoginZodSchema),
  authController.googleLogin,
);
authRoutes.post(
  "/refresh-token",
  authRateLimiter,
  validateRequest(refreshTokenZodSchema),
  authController.refreshToken,
);
