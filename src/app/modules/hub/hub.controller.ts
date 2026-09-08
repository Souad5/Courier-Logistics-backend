import type { Request, Response } from "express";

import { catchAsync } from "../../utils/catchAsync";
import { sendSuccess } from "../../utils/sendResponse";
import { createHub, listHubs, softDeleteHub, updateHub } from "./hub.service";
import type { CreateHubInput, UpdateHubInput } from "./hub.validation";

export const createHubHandler = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as CreateHubInput;
  const hub = await createHub(body, req.user!.id);

  sendSuccess(res, "Hub created successfully.", { hub }, undefined, 201);
});

export const getHubs = catchAsync(async (req: Request, res: Response) => {
  const query = req.query as Record<string, unknown>;
  const { hubs, meta } = await listHubs(query);

  sendSuccess(res, "Hubs fetched successfully.", { hubs }, meta, 200);
});

export const updateHubHandler = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as UpdateHubInput;
  const hub = await updateHub(String(req.params.id), body, req.user!.id);

  sendSuccess(res, "Hub updated successfully.", { hub }, undefined, 200);
});

export const deleteHubHandler = catchAsync(async (req: Request, res: Response) => {
  await softDeleteHub(String(req.params.id), req.user!.id);

  sendSuccess(res, "Hub soft-deleted successfully.", null, undefined, 200);
});
