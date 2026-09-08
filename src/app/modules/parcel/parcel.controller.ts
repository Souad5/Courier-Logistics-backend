import { Role } from "@prisma/client";
import type { Request, Response } from "express";

import { catchAsync } from "../../utils/catchAsync";
import { sendSuccess } from "../../utils/sendResponse";
import {
  assignParcelToCourier,
  createParcel,
  listMyParcels,
  listParcels,
  softDeleteParcel,
  trackParcel,
  updateParcelStatus,
} from "./parcel.service";
import type {
  AssignParcelInput,
  CreateParcelInput,
  UpdateParcelStatusInput,
} from "./parcel.validation";

export const createParcelHandler = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as CreateParcelInput;
  const parcel = await createParcel(req.user!.id, body, req);

  sendSuccess(
    res,
    "Parcel created successfully. Proceed to payment to activate shipping.",
    { parcel },
    undefined,
    201,
  );
});

export const getParcels = catchAsync(async (req: Request, res: Response) => {
  const query = req.query as Record<string, unknown>;
  const { parcels, meta } = await listParcels(query);

  sendSuccess(res, "Parcels fetched successfully.", { parcels }, meta, 200);
});

export const getMyParcels = catchAsync(async (req: Request, res: Response) => {
  const query = req.query as Record<string, unknown>;
  const { parcels, meta } = await listMyParcels(req.user!.id, req.user!.role, query);

  sendSuccess(res, "Your parcels fetched successfully.", { parcels }, meta, 200);
});

export const trackParcelHandler = catchAsync(async (req: Request, res: Response) => {
  const result = await trackParcel(String(req.params.trackingNumber));

  sendSuccess(res, "Parcel tracking info fetched successfully.", result, undefined, 200);
});

export const assignParcelHandler = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as AssignParcelInput;
  const parcel = await assignParcelToCourier(String(req.params.id), body, req.user!.id);

  sendSuccess(res, "Courier assigned to parcel successfully.", { parcel }, undefined, 200);
});

export const updateStatusHandler = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as UpdateParcelStatusInput;
  const actor = { id: req.user!.id, role: req.user!.role };
  const parcel = await updateParcelStatus(String(req.params.id), actor, body);

  sendSuccess(res, `Parcel status updated to ${body.status}.`, { parcel }, undefined, 200);
});

export const deleteParcelHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = { id: req.user!.id, role: req.user!.role };
  await softDeleteParcel(String(req.params.id), actor);

  sendSuccess(res, "Parcel soft-deleted successfully.", null, undefined, 200);
});

export { Role };
