export interface IDevice {
    id: string;
    siteId: string;
    buildingId: string;
    floorId: string;
    spaceId: string;
    deviceGroupId: string;
    referenceId: string | null;
    ontologyType: string | null;
    productType: string | null;
    commissionedStatus: CommissionedStatus;
    commissionedOn: string;
    decommissionedOn: string | null;
    name: string | null;
    coordinates?: any; // Specify type if known
    measurements?: object[];
    metadata?: object[];
    sourceId: string;
    vendorIdentifier: string | null;
}

export enum CommissionedStatus {
    All = 0,
    Commissioned = 1,
    Decommissioned = 2
}