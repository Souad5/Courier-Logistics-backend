import { Router } from "express";
import { adminRoutes } from "../modules/auditLog/auditLog.route";
import { authRoutes } from "../modules/auth/auth.route";
import { hubRoutes } from "../modules/hub/hub.route";
import { parcelRoutes } from "../modules/parcel/parcel.route";
import { paymentRoutes } from "../modules/payment/payment.route";
import { userRoutes } from "../modules/user/user.route";
import { sendSuccess } from "../utils/sendResponse";

export const apiRoutes = Router();

apiRoutes.get("/health", (_req, res) => {
  sendSuccess(res, "Courier & Logistics API is healthy", { status: "OK" });
});

apiRoutes.get("/", (_req, res) => {
  sendSuccess(res, "B7A6 Courier & Logistics Management Platform API", {
    version: "v1",
    modules: ["auth", "users", "hubs", "parcels", "payments", "admin"],
  });
});

apiRoutes.use("/auth", authRoutes);
apiRoutes.use("/users", userRoutes);
apiRoutes.use("/hubs", hubRoutes);
apiRoutes.use("/parcels", parcelRoutes);
apiRoutes.use("/payments", paymentRoutes);
apiRoutes.use("/admin", adminRoutes);
