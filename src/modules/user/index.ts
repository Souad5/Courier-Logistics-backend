import { Router } from "express";

import { sendSuccess } from "../../utils/ApiResponse";

const userRouter = Router();

userRouter.get("/ping", (_req, res) => {
  sendSuccess(res, "User module ready", { module: "user" });
});

export { userRouter };
