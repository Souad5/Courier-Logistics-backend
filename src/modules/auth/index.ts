import { Router } from "express";

import { sendSuccess } from "../../utils/ApiResponse";

const authRouter = Router();

// Placeholder — auth + RBAC implemented in Step (a)
authRouter.get("/ping", (_req, res) => {
  sendSuccess(res, "Auth module ready", { module: "auth" });
});

export { authRouter };
