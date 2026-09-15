import { Role } from "@prisma/client";
import { Router } from "express";

import { authenticate, authorizeRoles } from "../../middlewares/auth";
import { validateRequest } from "../../middlewares/validateRequest";
import * as paymentController from "./payment.controller";
import { initiatePaymentZodSchema } from "./payment.validation";

export const paymentRoutes = Router();

// Stripe webhook — MUST stay before authenticate. Raw body parser is applied in app.ts.
paymentRoutes.post("/webhook", paymentController.stripeWebhookHandler);

// Stripe redirect fallbacks — public, no auth required.
paymentRoutes.get("/success", paymentController.paymentSuccessHandler);
paymentRoutes.get("/cancel", paymentController.paymentCancelHandler);

paymentRoutes.use(authenticate);

paymentRoutes.post(
  "/initiate",
  authorizeRoles(Role.CUSTOMER),
  validateRequest(initiatePaymentZodSchema),
  paymentController.initiatePaymentHandler,
);
paymentRoutes.get("/:id", paymentController.getPaymentHandler);
