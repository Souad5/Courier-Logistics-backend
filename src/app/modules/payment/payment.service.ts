import { ParcelStatus, type Payment, PaymentStatus, Role } from "@prisma/client";
import Stripe from "stripe";

import { env, prisma } from "../../../config";
import { AppError } from "../../errors/AppError";
import { logAudit } from "../../utils/audit";
import type { IInitiatePaymentInput, IInitiatePaymentResult } from "./payment.interface";

function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError(503, "Stripe is not configured on this server.");
  }
  return new Stripe(env.STRIPE_SECRET_KEY);
}

export async function initiatePayment(
  senderId: string,
  input: IInitiatePaymentInput,
): Promise<IInitiatePaymentResult> {
  const stripe = getStripe();

  const parcel = await prisma.parcel.findUnique({
    where: { id: input.parcelId, isDeleted: false },
  });

  if (!parcel) throw new AppError(404, "Parcel not found.");
  if (parcel.senderId !== senderId) {
    throw new AppError(403, "You can only pay for your own parcels.");
  }
  if (parcel.status !== ParcelStatus.PENDING) {
    throw new AppError(409, "Only pending parcels can be paid for.");
  }

  const existingPayment = await prisma.payment.findUnique({
    where: { parcelId: parcel.id },
    include: { parcel: true },
  });

  if (existingPayment && existingPayment.status === PaymentStatus.PAID) {
    throw new AppError(409, "This parcel has already been paid for.");
  }

  const amountInCents = Math.round(Number(parcel.fee) * 100);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: parcel.currency.toLowerCase(),
          unit_amount: amountInCents,
          product_data: {
            name: `Courier shipment ${parcel.trackingNumber}`,
            description: `${parcel.senderName} → ${parcel.receiverName}`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: parcel.id,
    metadata: { parcelId: parcel.id, senderId, trackingNumber: parcel.trackingNumber },
  });

  let payment: Payment;

  if (existingPayment) {
    payment = await prisma.payment.update({
      where: { id: existingPayment.id },
      data: { status: PaymentStatus.PENDING, stripeSessionId: session.id },
    });
  } else {
    payment = await prisma.payment.create({
      data: {
        parcelId: parcel.id,
        senderId,
        amount: parcel.fee,
        currency: parcel.currency,
        method: "STRIPE",
        status: PaymentStatus.PENDING,
        stripeSessionId: session.id,
      },
    });
  }

  await logAudit({
    action: "PAYMENT_CREATED",
    actorId: senderId,
    entityType: "Payment",
    entityId: payment.id,
    newValue: { parcelId: parcel.id, sessionId: session.id, amount: Number(parcel.fee) },
  });

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
    payment: {
      id: payment.id,
      parcelId: parcel.id,
      amount: parcel.fee,
      currency: parcel.currency,
      method: payment.method,
      status: payment.status,
    },
  };
}

export async function handleStripeWebhook(
  signature: string | undefined,
  rawBody: Buffer | string,
): Promise<void> {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(503, "Stripe webhook secret is not configured.");
  }

  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new AppError(400, "Invalid Stripe webhook signature.");
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleSessionCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      await handleSessionFailed(event.data.object as Stripe.Checkout.Session);
      break;
    default:
      break;
  }
}

async function handleSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { stripeSessionId: session.id },
    include: { parcel: true },
  });

  if (!payment) throw new AppError(404, "Payment session not found in database.");
  if (payment.status === PaymentStatus.PAID) return; // idempotent — already processed

  await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.PAID,
        stripePaymentIntentId:
          typeof session.payment_intent === "string" ? session.payment_intent : null,
        transactionId:
          typeof session.payment_intent === "string" ? session.payment_intent : session.id,
        paidAt: new Date(),
      },
    });

    let parcelUpdated = false;
    if (payment.parcel.status === ParcelStatus.PENDING) {
      await tx.parcel.update({
        where: { id: payment.parcelId },
        data: { status: ParcelStatus.ACCEPTED },
      });
      await tx.parcelStatusHistory.create({
        data: {
          parcelId: payment.parcelId,
          status: ParcelStatus.ACCEPTED,
          fromStatus: ParcelStatus.PENDING,
          note: "Payment confirmed — parcel accepted for shipping.",
        },
      });
      parcelUpdated = true;
    }

    await logAudit({
      action: "PAYMENT_VERIFIED",
      actorId: payment.senderId,
      entityType: "Payment",
      entityId: payment.id,
      newValue: {
        status: PaymentStatus.PAID,
        paidAt: updatedPayment.paidAt ? updatedPayment.paidAt.toISOString() : null,
        parcelStatusChanged: parcelUpdated,
      },
      metadata: { stripeEventId: session.id },
      tx,
    });
  });
}

async function handleSessionFailed(session: Stripe.Checkout.Session): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where: { stripeSessionId: session.id, status: PaymentStatus.PENDING },
  });

  if (!payment) return;

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED },
    });

    await logAudit({
      action: "PAYMENT_FAILED",
      actorId: payment.senderId,
      entityType: "Payment",
      entityId: payment.id,
      newValue: { status: PaymentStatus.FAILED, sessionId: session.id },
      tx,
    });
  });
}

export async function getPayment(paymentId: string, requester: { id: string; role: Role }) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId, isDeleted: false },
    include: {
      parcel: {
        include: {
          originHub: { select: { id: true, name: true, zoneName: true } },
          destinationHub: { select: { id: true, name: true, zoneName: true } },
        },
      },
    },
  });

  if (!payment) throw new AppError(404, "Payment not found.");
  if (requester.role !== Role.ADMIN && payment.senderId !== requester.id) {
    throw new AppError(403, "You do not have access to this payment.");
  }

  return payment;
}
