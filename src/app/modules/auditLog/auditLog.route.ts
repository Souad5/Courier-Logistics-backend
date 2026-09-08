import { Role } from "@prisma/client";
import { Router } from "express";

import { authenticate, authorizeRoles } from "../../middlewares/auth";
import * as auditLogController from "./auditLog.controller";

export const adminRoutes = Router();

adminRoutes.use(authenticate, authorizeRoles(Role.ADMIN));

adminRoutes.get("/dashboard-stats", auditLogController.dashboardStats);
adminRoutes.get("/audit-logs", auditLogController.auditLogs);
