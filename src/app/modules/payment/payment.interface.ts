import type { PaymentMethod, PaymentStatus } from "@prisma/client";

export interface IInitiatePaymentInput {
  parcelId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface IInitiatePaymentResult {
  checkoutUrl: string | null;
  sessionId: string;
  payment: {
    id: string;
    parcelId: string;
    amount: unknown;
    currency: string;
    method: PaymentMethod;
    status: PaymentStatus;
  };
}
