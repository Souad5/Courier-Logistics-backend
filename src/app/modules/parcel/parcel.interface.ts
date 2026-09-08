import type { ParcelStatus, ParcelType } from "@prisma/client";

export interface ICreateParcelInput {
  type: ParcelType;
  weightKg: number;
  dimensions?: string;
  originHubId: string;
  destinationHubId: string;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  senderCity?: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  receiverCity?: string;
  notes?: string;
}

export interface IAssignParcelInput {
  courierId: string;
  destinationHubId?: string;
}

export interface IUpdateParcelStatusInput {
  status: ParcelStatus;
  location?: string;
  note?: string;
}

export interface IParcelStatusHistoryPayload {
  id: string;
  status: ParcelStatus;
  fromStatus: ParcelStatus | null;
  location: string | null;
  note: string | null;
  createdAt: Date;
}

export interface IParcelTrackingPayload {
  trackingNumber: string;
  status: ParcelStatus;
  type: ParcelType;
  fee: unknown;
  currency: string;
  senderCity: string | null;
  receiverName: string;
  receiverCity: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
  history: IParcelStatusHistoryPayload[];
}

export type ParcelInclude = {
  sender: { select: { id: true; name: true; email: true; phone: true } };
  courier: { select: { id: true; name: true; email: true; phone: true } } | null;
  originHub: {
    select: { id: true; name: true; code: true; zoneCode: true; zoneName: true };
  } | null;
  destinationHub: {
    select: { id: true; name: true; code: true; zoneCode: true; zoneName: true };
  } | null;
  payment: { select: { id: true; status: true; amount: true; paidAt: true } } | null;
};
