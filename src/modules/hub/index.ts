import { Router } from "express";

import { sendSuccess } from "../../utils/ApiResponse";

const hubRouter = Router();

hubRouter.get("/ping", (_req, res) => {
  sendSuccess(res, "Hub module ready", { module: "hub" });
});

export { hubRouter };
