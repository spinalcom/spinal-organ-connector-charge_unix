export interface IMeasurementValue {
  id: string;
  siteId: string;
  buildingId: string;
  floorId: string;
  spaceId: string;
  deviceId: string;
  deviceGroupId: string | null;
  referenceId: string | null;
  ontologyType: string | null;
  context: MeasurementValueContext;
  measuredId: string;
  name: string | null;
  unit: string | null;
  value?: boolean | number | string;
  timestamp: string | null;
  metadata: object[];
  isWriteable: boolean;
  commissionedStatus: CommissionedStatus;
  commissionedOn: string;
  decommissionedOn: string | null;
}

export enum MeasurementValueContext {
  Room = 0,
  Building = 1,
  Level = 2,
  Site = 3,
  OutdoorSpace = 4,
  Zone = 5,
  Wing = 6,
  None = 7,
}

export enum CommissionedStatus {
  All = 0,
  Commissioned = 1,
  Decommissioned = 2,
}