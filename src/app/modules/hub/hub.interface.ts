export interface ICreateHubInput {
  name: string;
  code: string;
  zoneCode: string;
  zoneName: string;
  address: string;
  city?: string;
  lat?: number;
  lng?: number;
}

export interface IUpdateHubInput extends Partial<ICreateHubInput> {}

export interface IHubPayload {
  id: string;
  name: string;
  code: string;
  zoneCode: string;
  zoneName: string;
  address: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
