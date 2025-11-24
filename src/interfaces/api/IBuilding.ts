export interface IBuilding {
  id: string;
  name: string | null;
  referenceId: string | null;
  area: number;
  metadata: object[];
  organizationName: string | null;
  organizationId: string;
  siteId: string;
  floorCount: number;
  spaceCount: number;
  deviceCount: number;
  measurementCount: number;
  includesDeviceAndMeasurementCounts: boolean;
}
