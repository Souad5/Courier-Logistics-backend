import { Router } from "express";

import { sendSuccess } from "../../utils/ApiResponse";

const paymentRouter = Router();

paymentRouter.get("/ping", (_req, res) => {
  sendSuccess(res, "Payment module ready", { module: "payment" });
});

export { paymentRouter };
