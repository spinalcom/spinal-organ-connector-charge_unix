export interface IZone {
  id: number;
  name: string;
  dynamicError: number;
  equipmentId: number | null;
  createdAt: string;
  updatedAt: string;
  dynamicLimitL1: number | null;
  dynamicLimitL2: number | null;
  dynamicLimitL3: number | null;
  staticLimitL1: number | null;
  staticLimitL2: number | null;
  staticLimitL3: number | null;
  energyPrice: number | null;
}
