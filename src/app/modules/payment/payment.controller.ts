import type { Request, Response } from "express";

import { catchAsync } from "../../utils/catchAsync";
import { sendSuccess } from "../../utils/sendResponse";
import { getPayment, handleStripeWebhook, initiatePayment } from "./payment.service";
import type { InitiatePaymentInput } from "./payment.validation";

export const initiatePaymentHandler = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as InitiatePaymentInput;
  const result = await initiatePayment(req.user!.id, body);

  sendSuccess(
    res,
    "Payment initiated. Complete checkout to activate the parcel.",
    result,
    undefined,
    201,
  );
});

export const stripeWebhookHandler = catchAsync(async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string | undefined;
  const rawBody = req.body as Buffer | string | undefined;

  if (!rawBody) {
    // Express raw parser delivers a Buffer; a string indicates a non-raw parse path.
    return sendSuccess(res, "Webhook received but no payload available.", null, undefined, 200);
  }

  await handleStripeWebhook(signature, rawBody);
  sendSuccess(res, "Webhook processed successfully.", null, undefined, 200);
});

export const paymentSuccessHandler = (_req: Request, res: Response) => {
  res.send("<h1>Payment Successful! You can close this tab.</h1>");
};

export const paymentCancelHandler = (_req: Request, res: Response) => {
  res.send("<h1>Payment Canceled. You can close this tab.</h1>");
};

export const getPaymentHandler = catchAsync(async (req: Request, res: Response) => {
  const payment = await getPayment(String(req.params.id), {
    id: req.user!.id,
    role: req.user!.role,
  });

  sendSuccess(res, "Payment details fetched successfully.", { payment }, undefined, 200);
});
