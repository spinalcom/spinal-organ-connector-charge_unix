

export interface ITransaction {
    id: number;
    chargingStationIdentity: string;
    connectorId: number;
    local: boolean;
    vip: boolean;
    transactionId: number;
    rewriteTransactionId: number | null;
    tagId: string;
    data: any | null;
    extra: any | null;
    reason: string | null;
    meterStart: number;
    meterValue: number;
    reservationId: number | null;
    terminatedAt: string | null;
    amount: string;
    createdAt: string;
    updatedAt: string;
}

export interface ITransactionResponse {
    current_page: number,
    data: ITransaction[];
    first_page_url: string,
    from: number,
    last_page: number,
    last_page_url: string,
    links: Array<{
        url: string | null,
        label: string,
        active: boolean
    }>,
    next_page_url: string | null,
    path: string,
    per_page: number,
    prev_page_url: string | null,
    to: number,
    total: number

}