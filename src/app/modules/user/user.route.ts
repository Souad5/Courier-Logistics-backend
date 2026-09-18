import { Role } from "@prisma/client";
import { Router } from "express";

import { authenticate, authorizeRoles } from "../../middlewares/auth";
import { validateRequest } from "../../middlewares/validateRequest";
import * as userController from "./user.controller";
import {
  updateAvailabilityZodSchema,
  updateProfileZodSchema,
  updateRoleZodSchema,
} from "./user.validation";

export const userRoutes = Router();

userRoutes.get("/me", authenticate, userController.getMe);
userRoutes.patch(
  "/me",
  authenticate,
  validateRequest(updateProfileZodSchema),
  userController.updateMe,
);
userRoutes.patch(
  "/me/availability",
  authenticate,
  authorizeRoles(Role.COURIER),
  validateRequest(updateAvailabilityZodSchema),
  userController.updateAvailability,
);

userRoutes.get("/", authenticate, authorizeRoles(Role.ADMIN), userController.getUsers);
userRoutes.patch(
  "/:id/role",
  authenticate,
  authorizeRoles(Role.ADMIN),
  validateRequest(updateRoleZodSchema),
  userController.changeUserRole,
);
