import { Router } from "express";
import { adminRouter } from "../modules/admin";
import { authRouter } from "../modules/auth";
import { courierRouter } from "../modules/courier";
import { hubRouter } from "../modules/hub";
import { paymentRouter } from "../modules/payment";
import { shipmentRouter } from "../modules/shipment";
import { userRouter } from "../modules/user";
import { healthCheck } from "../utils";
import { sendSuccess } from "../utils/ApiResponse";

export const apiRouter = Router();

apiRouter.get("/health", healthCheck);

apiRouter.get("/", (_req, res) => {
  sendSuccess(res, "Courier & Logistics Management Platform API v1", {
    name: "B7A6 Courier & Logistics API",
    version: "v1",
    docs: "Use Postman/Thunder Client",
  });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/shipments", shipmentRouter);
apiRouter.use("/couriers", courierRouter);
apiRouter.use("/payments", paymentRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/hubs", hubRouter);
