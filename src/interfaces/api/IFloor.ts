export interface IFloor {
    id: string;
    name: string | null;
    referenceId: string | null;
    area: number;
    metadata: object[];
    buildingId: string;
    spaceCount: number;
    deviceCount: number;
    measurementCount: number;
    includesDeviceAndMeasurementCounts: boolean;
}