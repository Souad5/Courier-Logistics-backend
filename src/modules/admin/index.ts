import { Router } from "express";

import { sendSuccess } from "../../utils/ApiResponse";

const adminRouter = Router();

adminRouter.get("/ping", (_req, res) => {
  sendSuccess(res, "Admin module ready", { module: "admin" });
});

export { adminRouter };
