import { Router } from "express";

import { sendSuccess } from "../../utils/ApiResponse";

const shipmentRouter = Router();

shipmentRouter.get("/ping", (_req, res) => {
  sendSuccess(res, "Shipment module ready", { module: "shipment" });
});

export { shipmentRouter };
