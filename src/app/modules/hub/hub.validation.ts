import { z } from "zod";

export const createHubZodSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9_-]+$/i, "Hub code may only contain letters, numbers, dashes and underscores."),
  zoneCode: z.string().trim().min(2).max(30),
  zoneName: z.string().trim().min(2).max(60),
  address: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(60).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const updateHubZodSchema = createHubZodSchema.partial();

export type CreateHubInput = z.infer<typeof createHubZodSchema>;
export type UpdateHubInput = z.infer<typeof updateHubZodSchema>;
