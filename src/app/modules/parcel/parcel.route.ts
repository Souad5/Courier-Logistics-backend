import { Role } from "@prisma/client";
import { Router } from "express";

import { authenticate, authorizeRoles } from "../../middlewares/auth";
import { uploadProofOfDeliveryPhoto } from "../../middlewares/upload";
import { validateRequest } from "../../middlewares/validateRequest";
import * as parcelController from "./parcel.controller";
import {
  assignParcelZodSchema,
  createParcelZodSchema,
  updateParcelStatusZodSchema,
} from "./parcel.validation";

export const parcelRoutes = Router();

// Public tracking view (no auth required)
parcelRoutes.get("/track/:trackingNumber", parcelController.trackParcelHandler);

parcelRoutes.use(authenticate);

parcelRoutes.post(
  "/",
  authorizeRoles(Role.CUSTOMER),
  validateRequest(createParcelZodSchema),
  parcelController.createParcelHandler,
);
parcelRoutes.get("/", authorizeRoles(Role.ADMIN), parcelController.getParcels);
parcelRoutes.get(
  "/my-parcels",
  authorizeRoles(Role.CUSTOMER, Role.COURIER),
  parcelController.getMyParcels,
);
// Ownership (sender/assigned courier) or Admin — enforced in the service, same
// pattern as DELETE /:id below, since all three roles can legitimately reach
// their own subset of parcels here.
parcelRoutes.get("/:id", parcelController.getParcelHandler);

parcelRoutes.patch(
  "/:id/assign",
  authorizeRoles(Role.ADMIN),
  validateRequest(assignParcelZodSchema),
  parcelController.assignParcelHandler,
);
parcelRoutes.patch(
  "/:id/status",
  authorizeRoles(Role.COURIER, Role.ADMIN),
  validateRequest(updateParcelStatusZodSchema),
  parcelController.updateStatusHandler,
);
parcelRoutes.post(
  "/:id/proof-of-delivery",
  authorizeRoles(Role.COURIER, Role.ADMIN),
  uploadProofOfDeliveryPhoto,
  parcelController.uploadProofOfDeliveryHandler,
);
parcelRoutes.delete("/:id", parcelController.deleteParcelHandler);
