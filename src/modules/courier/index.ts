import { Router } from "express";

import { sendSuccess } from "../../utils/ApiResponse";

const courierRouter = Router();

courierRouter.get("/ping", (_req, res) => {
  sendSuccess(res, "Courier module ready", { module: "courier" });
});

export { courierRouter };
