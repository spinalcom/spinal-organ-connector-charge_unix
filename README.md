# spinal-organ-connector-charge_unix
Simple BOS-ChargeUnix api connector to collect data

## Getting Started

These instructions will guide you on how to install and make use of the spinal-organ-connector-charge_unix.

### Prerequisites

This module requires a `.env` file in the root directory. Use the `.env.example` file as a template to create your own `.env` file with the necessary configuration.

spinalcom-utils required


### Installation

Clone this repository in the directory of your choice. Navigate to the cloned directory and install the dependencies using the following command:
    
```bash
spinalcom-utils i
```

To build the module, run:

```bash
npm run build
```

### Usage

Start the module with:

```bash
npm run start
```

Or using [pm2](https://pm2.keymetrics.io/docs/usage/quick-start/)
```bash
pm2 start index.js --name organ-connector-xxxxx
```

## Sequence Diagram

```mermaid
sequenceDiagram
    participant SH as SpinalHub
    participant C as Connector (spinal-organ-connector-charge_unix)
    participant API as Charge-Unix API Server

    SH->>C: Start connector
    C->>SH: Initialize NetworkService + required contexts/nodes
    C->>SH: Map existing ChargingStation/EnergyCounter BIM nodes by link attributes

    Note over C,API: Initialization phase (`init()`)
    C->>API: GET /zone/data
    API-->>C: zones[]
    C->>SH: Create missing zone groups
    C->>SH: Update zone attributes (limits, price, id)

    C->>API: GET /charging-station/data
    API-->>C: chargingStations[]
    C->>SH: Update charging station attributes

    C->>API: POST /equipment/data
    API-->>C: energyCounters[]
    C->>SH: Update energy counter attributes
    C->>SH: Link charging stations to zone groups

    C->>API: GET /connector/data
    API-->>C: connectors[]
    C->>SH: Create missing BMS devices + endpoints
    Note right of C: CS endpoints: connected, lastHeartbeat, Connector_<id>_Status
    Note right of C: EC endpoints: connected, Current_L1/L2/L3, Energy_Consumption
    C->>SH: Link BMS devices to Typology nodes (hasBmsDevice)

    C->>API: GET /transaction/paginate?perPage=200
    API-->>C: transactions[]
    C->>SH: Create/update tickets in workflow
    Note right of C: Move terminated tickets Pending -> Terminated
    C->>SH: Set config.lastSync

    loop Polling phase (`run()`, every `PULL_INTERVAL`)
        C->>API: GET /charging-station/data + /connector/data
        API-->>C: chargingStations[] + connectors[]
        C->>SH: Update CS endpoints (connected, heartbeat, connector status enum)

        C->>API: POST /equipment/data
        API-->>C: energyCounters[]
        C->>SH: Update EC endpoints (connected, currents, energy)

        C->>API: GET /transaction/paginate?perPage=200
        API-->>C: transactions[]
        C->>SH: Create/update/move transaction tickets
        C->>SH: Set config.lastSync
    end
```
