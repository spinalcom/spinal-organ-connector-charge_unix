export interface ISpace {
    siteId: string;
    buildingId: string;
    floorId: string;
    deviceCount: number;
    measurementCount: number;
    includesDeviceAndMeasurementCounts: boolean;
    ontologyType: string;
    name: string | null;
    referenceId: string | null;
    commissionedStatus: number;
    commissionedOn: string | null;
    decommissionedOn: string | null;
    area: number;
    metadata: object[];
    id: string;
}