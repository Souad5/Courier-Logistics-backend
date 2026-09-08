import { ParcelStatus, ParcelType } from "@prisma/client";
import { z } from "zod";

export const createParcelZodSchema = z.object({
  type: z.nativeEnum(ParcelType).default(ParcelType.PARCEL),
  weightKg: z
    .number()
    .positive("Weight must be positive")
    .max(1000, "Weight exceeds maximum of 1000kg"),
  dimensions: z.string().trim().max(50).optional(),
  originHubId: z.string().uuid("Valid origin hub id is required"),
  destinationHubId: z.string().uuid("Valid destination hub id is required"),
  senderName: z.string().trim().min(2).max(60),
  senderPhone: z.string().trim().min(6).max(20),
  senderAddress: z.string().trim().min(3).max(200),
  senderCity: z.string().trim().min(2).max(60).optional(),
  receiverName: z.string().trim().min(2).max(60),
  receiverPhone: z.string().trim().min(6).max(20),
  receiverAddress: z.string().trim().min(3).max(200),
  receiverCity: z.string().trim().min(2).max(60).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const assignParcelZodSchema = z.object({
  courierId: z.string().uuid("Valid courier id is required"),
  destinationHubId: z.string().uuid().optional(),
});

export const updateParcelStatusZodSchema = z.object({
  status: z.nativeEnum(ParcelStatus),
  location: z.string().trim().min(2).max(120).optional(),
  note: z.string().trim().min(2).max(300).optional(),
});

export type CreateParcelInput = z.infer<typeof createParcelZodSchema>;
export type AssignParcelInput = z.infer<typeof assignParcelZodSchema>;
export type UpdateParcelStatusInput = z.infer<typeof updateParcelStatusZodSchema>;
