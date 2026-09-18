import { Role } from "@prisma/client";
import type { Request, Response } from "express";

import { catchAsync } from "../../utils/catchAsync";
import { sendSuccess } from "../../utils/sendResponse";
import {
  getCurrentUser,
  listUsers,
  updateCourierAvailability,
  updateCurrentUser,
  updateUserRole,
} from "./user.service";
import type {
  UpdateAvailabilityInput,
  UpdateProfileInput,
  UpdateRoleInput,
} from "./user.validation";

export const getMe = catchAsync(async (req: Request, res: Response) => {
  const user = await getCurrentUser(req.user!.id);
  sendSuccess(res, "Profile fetched successfully.", { user }, undefined, 200);
});

export const updateMe = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as UpdateProfileInput;
  const user = await updateCurrentUser(req.user!.id, body);
  sendSuccess(res, "Profile updated successfully.", { user }, undefined, 200);
});

export const getUsers = catchAsync(async (req: Request, res: Response) => {
  const query = req.query as Record<string, unknown>;
  const { users, meta } = await listUsers(query);

  sendSuccess(res, "Users fetched successfully.", { users }, meta, 200);
});

export const updateAvailability = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as UpdateAvailabilityInput;
  const user = await updateCourierAvailability(req.user!.id, body.isAvailable);

  sendSuccess(
    res,
    body.isAvailable ? "You are now available for new assignments." : "You are now unavailable.",
    { user },
    undefined,
    200,
  );
});

export const changeUserRole = catchAsync(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const body = req.body as UpdateRoleInput;

  const user = await updateUserRole(id, body.role, req.user!.id);
  sendSuccess(res, `User role updated to ${Role[body.role]}.`, { user }, undefined, 200);
});
