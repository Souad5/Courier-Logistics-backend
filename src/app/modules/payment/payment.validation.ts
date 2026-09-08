import { z } from "zod";

export const initiatePaymentZodSchema = z.object({
  parcelId: z.string().uuid("Valid parcel id is required"),
  successUrl: z.string().url("Valid success URL is required"),
  cancelUrl: z.string().url("Valid cancel URL is required"),
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentZodSchema>;
