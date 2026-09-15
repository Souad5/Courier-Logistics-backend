import { z } from "zod";

export const initiatePaymentZodSchema = z.object({
  parcelId: z.string().uuid("Invalid parcel ID"),
  successUrl: z.string().url("Valid success URL is required").optional(),
  cancelUrl: z.string().url("Valid cancel URL is required").optional(),
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentZodSchema>;
