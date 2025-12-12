
export interface IChargingStation {
  identity: string;
  name: string;
  connected: boolean;
  operatorUrl: string | null;
  operatorIdentity: string | null;
  operatorConnected: number;
  operatorDisconnectedPolicy: string;
  operatorHeartbeatMinimumInterval: number;
  operatorMetervaluesMinimumInterval: number;
  chargePointVendor: string;
  chargePointModel: string;
  chargeBoxSerialNumber: string;
  chargePointSerialNumber: string;
  firmwareVersion: string;
  iccid: string;
  imsi: string;
  meterSerialNumber: string;
  meterType: string;
  ipAddress: string;
  zoneId: number;
  vip: boolean;
  currentLimit: number | null;
  version: string;
  lastHeartbeat: string;
  createdAt: string;
  updatedAt: string;
  supportedFeatures: string;
  bootMetervalue: boolean;
}
