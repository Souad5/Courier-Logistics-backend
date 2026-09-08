import { Role } from "@prisma/client";
import { Router } from "express";

import { authenticate, authorizeRoles } from "../../middlewares/auth";
import { validateRequest } from "../../middlewares/validateRequest";
import * as hubController from "./hub.controller";
import { createHubZodSchema, updateHubZodSchema } from "./hub.validation";

export const hubRoutes = Router();

// Public listing so customers can find active hubs / zones before creating parcels.
hubRoutes.get("/", hubController.getHubs);

hubRoutes.post(
  "/",
  authenticate,
  authorizeRoles(Role.ADMIN),
  validateRequest(createHubZodSchema),
  hubController.createHubHandler,
);
hubRoutes.patch(
  "/:id",
  authenticate,
  authorizeRoles(Role.ADMIN),
  validateRequest(updateHubZodSchema),
  hubController.updateHubHandler,
);
hubRoutes.delete("/:id", authenticate, authorizeRoles(Role.ADMIN), hubController.deleteHubHandler);
