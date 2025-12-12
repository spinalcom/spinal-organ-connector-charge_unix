import { IZone } from './IZone';

export interface IVariable {
  id: number;
  productId: number;
  productRequestId: number;
  offset: number;
  name: string;
  type: string;
  unit: string | null;
  chart: string | null;
  expression: string | null;
  round: number;
  logInterval: number;
  logDuration: number;
  createdAt: string;
  updatedAt: string;
  localName: string;
  localChartName: string | null;
}

export interface IProduct {
  id: number;
  manufacturer: string;
  reference: string;
  variableL1: number;
  variableL2: number;
  variableL3: number;
  variableEnergy: number;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ICharts {
  [key: string]: string;
}

export interface IEquipment {
  id: number;
  name: string;
  productId: number;
  ipAddress: string;
  port: number;
  slaveId: number;
  connected: boolean;
  error: boolean;
  createdAt: string;
  updatedAt: string;
  charts: ICharts;
  product: IProduct;
  variables: IVariable[];
  zones?: IZone[];
  values? : IEquipmentValuesBlock;
}


export interface IEquipmentBase {
  id: number;
  name: string;
  productId: number;
  ipAddress: string;
  port: number;
  slaveId: number;
  connected: boolean;
  error: boolean;
  createdAt: string;
  updatedAt: string;
  charts: ICharts;
}



export interface IModbusRequest {
  success: boolean;
  equipmentRequestId: number;
  register: number;
  registers: number[];
  bytes: number[];
  buffer: {
    type: string;
    data: number[];
  };
  decoder: {
    buffer: {
      type: string;
      data: number[];
    };
    byteOrder: "Big" | "Little";
  };
}

export interface IVariableContext {
  value: number | null;
  requests: IModbusRequest[];
  request: IModbusRequest;
  variable: IVariable;
  logic: any[];
  debug: any[];
  http: any[];
  modbus: {
    BIG_ENDIAN: string;
    LITTLE_ENDIAN: string;
  };
  type: any[];
  math: any[];
  string: any[];
  date: any[];
  array: any[];
  edf: {
    tempo: Record<string, string>;
    ejp: any[];
    ecowatt: Record<string, string>;
  };
  exception: any[];
}


export interface IEquipmentVariableValue {
  valid: boolean;
  register: number;
  equipmentVariableId: number;
  equipmentRequestId: number;
  id: number;
  productId: number;
  productRequestId: number;
  offset: number;
  name: string;
  type: string;
  unit: string | null;
  chart: string | null;
  expression: string | null;
  round: number;
  logInterval: number;
  logDuration: number;
  createdAt: string;
  updatedAt: string;
  context: IVariableContext;
  value: number | null;
}



export interface IEquipmentValuesBlock {
  variables: {
    [variableId: string]: IEquipmentVariableValue;
  };
  currents?: {
    l1: { value: number, unit: string , normalized: number };
    l2: { value: number, unit: string , normalized: number };
    l3: { value: number, unit: string , normalized: number };
  }
  energy? : { value: number, unit: string , normalized: number}
}


export interface IEquipmentValuesResponse {
  equipment: IEquipmentBase;
  product: IProduct;
  values: IEquipmentValuesBlock;
}
