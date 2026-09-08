import type { Request, Response } from "express";

import { catchAsync } from "../../utils/catchAsync";
import { sendSuccess } from "../../utils/sendResponse";
import { getDashboardStats, listAuditLogs } from "./auditLog.service";

export const dashboardStats = catchAsync(async (_req: Request, res: Response) => {
  const stats = await getDashboardStats();

  sendSuccess(res, "Dashboard statistics fetched successfully.", { stats }, undefined, 200);
});

export const auditLogs = catchAsync(async (req: Request, res: Response) => {
  const query = req.query as Record<string, unknown>;
  const { logs, meta } = await listAuditLogs(query);

  sendSuccess(res, "Audit logs fetched successfully.", { logs }, meta, 200);
});
