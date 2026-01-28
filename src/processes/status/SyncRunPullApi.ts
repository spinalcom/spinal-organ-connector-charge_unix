/*
 * Copyright 2021 SpinalCom - www.spinalcom.com
 *
 * This file is part of SpinalCore.
 *
 * Please read all of the following terms and conditions
 * of the Free Software license Agreement ("Agreement")
 * carefully.
 *
 * This Agreement is a legally binding contract between
 * the Licensee (as defined below) and SpinalCom that
 * sets forth the terms and conditions that govern your
 * use of the Program. By installing and/or using the
 * Program, you agree to abide by all the terms and
 * conditions stated or referenced herein.
 *
 * If you do not agree to abide by these terms and
 * conditions, do not demonstrate your acceptance and do
 * not install or use the Program.
 * You should have received a copy of the license along
 * with this file. If not, see
 * <http://resources.spinalcom.com/licenses.pdf>.
 */

import moment = require('moment');
import {
  SpinalContext,
  SpinalGraph,
  SpinalGraphService,
  SpinalNode,
  SpinalNodeRef,
  SPINAL_RELATION_PTR_LST_TYPE,
} from 'spinal-env-viewer-graph-service';

import type OrganConfigModel from '../../model/OrganConfigModel';

import serviceDocumentation, {
  attributeService,
} from 'spinal-env-viewer-plugin-documentation-service';
import { ClientApi } from '../../services/client/ClientAuth';

import { SpinalAttribute } from 'spinal-models-documentation';
import { NetworkService, SpinalBmsEndpoint } from 'spinal-model-bmsnetwork';
import {
  InputDataDevice,
  InputDataEndpoint,
  InputDataEndpointGroup,
  InputDataEndpointDataType,
  InputDataEndpointType,
} from '../../model/InputData/InputDataModel/InputDataModel';


import { IZone } from '../../interfaces/api/IZone';
import { IEquipment } from '../../interfaces/api/IEquipment';
import groupManagerService from 'spinal-env-viewer-plugin-group-manager-service';

import { spinalServiceTicket, addTicket, moveTicketToStep } from "spinal-service-ticket"




import { SpinalServiceTimeseries } from 'spinal-model-timeseries';
import { IChargingStation } from '../../interfaces/api/IChargingStation';
import { ICSConnector } from '../../interfaces/api/ICSConnector';
import { ITransaction } from '../../interfaces/api/ITransaction';

/**
 * Main purpose of this class is to pull data from client.
 *
 * @export
 * @class SyncRunPull
 */
export class SyncRunPullApi {
  graph: SpinalGraph<any>;
  config: OrganConfigModel;
  interval: number;
  running: boolean;

  private apiClient: ClientApi;

  // Services spinal
  nwService: NetworkService;
  timeseriesService: SpinalServiceTimeseries;

  // Contexts spinal
  nwContext: SpinalContext<any>;
  typologyContext: SpinalContext<any>;
  zoneContext: SpinalContext<any>;
  transactionContext: SpinalContext<any>;


  // Level 1 Children Nodes
  nwVirtual: SpinalNode<any>;
  typologyCategory: SpinalNode<any>;
  zoneCategory: SpinalNode<any>;
  transactionProcess: SpinalNode<any>;



  // Level 2 Children Nodes
  chargingStationGroup: SpinalNode<any>;
  energyCounterGroup: SpinalNode<any>;
  pendingTransactionStep: SpinalNode<any>;
  terminatedTransactionStep: SpinalNode<any>;

  chargingStationIdentityToNodeRecord: Record<string, SpinalNode<any>> = {};
  energyCounterToNodeRecord: Record<string, SpinalNode<any>> = {};

  endpointMap: Map<string, SpinalNode<any>> = new Map();

  statusEnumerationMap: Map<string, number> = new Map([
    ['Unknown', 0],
    ['Available', 1],
    ['Preparing', 2],
    ['Charging', 3],
    ['SuspendedEV', 4],
    ['SuspendedEVSE', 5],
    ['Finishing', 6],
    ['Unavailable', 7],
    ['Faulted', 8],
    ['Reserved', 9],
    ['Offline', 10],
  ]);


  constructor(graph: SpinalGraph<any>, config: OrganConfigModel) {
    this.graph = graph;
    this.config = config;
    this.running = false;
    this.nwService = new NetworkService(true);
    this.apiClient = ClientApi.getInstance();
    this.timeseriesService = new SpinalServiceTimeseries();
  }

  private waitFct(nb: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(
        () => {
          resolve();
        },
        nb >= 0 ? nb : 0
      );
    });
  }

  async getContextByName(name: string): Promise<SpinalContext<any>> {
    const contexts = await this.graph.getChildren();
    for (const context of contexts) {
      if (context.info.name.get() === name) {
        // @ts-ignore
        SpinalGraphService._addNode(context);
        return context;
      }
    }
    throw new Error(`Context with name ${name} Not found`);
  }

  async initRequiredNodes(): Promise<void> {
    this.nwContext = await this.getContextByName(process.env.NETWORK_NAME);
    this.typologyContext = await this.getContextByName(process.env.TYPOLOGY_CONTEXT_NAME);
    this.zoneContext = await this.getContextByName(process.env.ZONE_CONTEXT_NAME);
    this.transactionContext = await this.getContextByName(process.env.WORKFLOW_NAME);


    this.nwVirtual = (await this.nwContext.getChildrenInContext()).find((node) => node.getName().get() === process.env.VIRTUAL_NETWORK_NAME);
    if (!this.nwVirtual) throw new Error('Virtual Network Node Not found');

    this.typologyCategory = (await this.typologyContext.getChildrenInContext()).find((node) => node.getName().get() === process.env.TYPOLOGY_CATEGORY_NAME);
    if (!this.typologyCategory) throw new Error('Typology Category Node Not found');

    this.zoneCategory = (await this.zoneContext.getChildrenInContext()).find((node) => node.getName().get() === process.env.ZONE_CATEGORY_NAME);
    if (!this.zoneCategory) throw new Error('Zone Category Node Not found');

    this.transactionProcess = (await this.transactionContext.getChildrenInContext()).find((node) => node.getName().get() === process.env.PROCESS_NAME);
    if (!this.transactionProcess) throw new Error('Transaction Process Node Not found');

    this.chargingStationGroup = (await this.typologyCategory.getChildrenInContext(this.typologyContext)).find((node) => node.getName().get() === process.env.CS_GROUP_NAME);
    this.energyCounterGroup = (await this.typologyCategory.getChildrenInContext(this.typologyContext)).find((node) => node.getName().get() === process.env.ENERGY_COUNTER_GROUP_NAME);
    if (!this.chargingStationGroup) throw new Error('Charging Station Group Node Not found');
    if (!this.energyCounterGroup) throw new Error('Energy Counter Group Node Not found');

    this.pendingTransactionStep = (await this.transactionProcess.getChildrenInContext(this.transactionContext)).find((node) => node.getName().get() === process.env.PENDING_STEP_NAME);
    this.terminatedTransactionStep = (await this.transactionProcess.getChildrenInContext(this.transactionContext)).find((node) => node.getName().get() === process.env.TERMINATED_STEP_NAME);
    if (!this.pendingTransactionStep) throw new Error('Pending Transaction Step Node Not found');
    if (!this.terminatedTransactionStep) throw new Error('Terminated Transaction Step Node Not found');


    const chargingStationNodes = await this.chargingStationGroup.getChildrenInContext(this.typologyContext);
    for (const csNode of chargingStationNodes) {
      SpinalGraphService._addNode(csNode);
      const csIdentityAttr = await attributeService.findOneAttributeInCategory(csNode, process.env.LINK_CATEGORY_ATTRIBUTE, process.env.LINK_ATTRIBUTE_LABEL);
      if (csIdentityAttr === -1) continue;
      const csIdentity = csIdentityAttr.value.get();
      this.chargingStationIdentityToNodeRecord[csIdentity] = csNode;
    }

    const energyCounterNodes = await this.energyCounterGroup.getChildrenInContext(this.typologyContext);
    for (const ecNode of energyCounterNodes) {
      SpinalGraphService._addNode(ecNode);
      const ecIdAttr = await attributeService.findOneAttributeInCategory(ecNode, process.env.LINK_CATEGORY_ATTRIBUTE, process.env.LINK_ATTRIBUTE_LABEL);
      if (ecIdAttr === -1) continue;
      const ecId = ecIdAttr.value.get();
      this.energyCounterToNodeRecord[ecId] = ecNode;
    }





    SpinalGraphService._addNode(this.nwVirtual);
    SpinalGraphService._addNode(this.typologyCategory);
    SpinalGraphService._addNode(this.zoneCategory);
    SpinalGraphService._addNode(this.transactionProcess);
    SpinalGraphService._addNode(this.chargingStationGroup);
    SpinalGraphService._addNode(this.energyCounterGroup);
    SpinalGraphService._addNode(this.pendingTransactionStep);
    SpinalGraphService._addNode(this.terminatedTransactionStep);
  }

  async createZonesIfNotExist(zoneData: IZone[]) {
    const existingZones = await this.zoneCategory.getChildrenInContext(this.zoneContext);
    let skippedCreations = 0;
    let createdZones = 0;
    for (const zone of zoneData) {
      let zoneNode = existingZones.find((node) => node.getName().get() === zone.name)
      if (zoneNode) {
        skippedCreations++;
        SpinalGraphService._addNode(zoneNode);
        continue;
      }

      const group = await groupManagerService.addGroup(
        this.zoneContext.getId().get(),
        this.zoneCategory.getId().get(),
        zone.name,
        "#ff0000",
        "local_parking"
      )
      SpinalGraphService._addNode(group);
      createdZones++;
    }
    console.log(`Zones creation: ${createdZones} created, ${skippedCreations} skipped (Already existed).`);
  }

  async updateZoneAttributes(zoneData: IZone[]) {
    const existingZones = await this.zoneCategory.getChildrenInContext(this.zoneContext);
    for (const zone of zoneData) {
      let zoneNode = existingZones.find((node) => node.getName().get() === zone.name)
      if (!zoneNode) {
        console.log(`Zone ${zone.name} not found, skipping attribute update. ( This should not happen if zones are created first )`);
        continue;
      }
      SpinalGraphService._addNode(zoneNode);
      await attributeService.createOrUpdateAttrsAndCategories(
        zoneNode,
        'Charge Unix',
        {
          "id": zone.id ? zone.id + '' : '',
          "dynamicLimitL1": zone.dynamicLimitL1 ? zone.dynamicLimitL1 + '' : '',
          "dynamicLimitL2": zone.dynamicLimitL2 ? zone.dynamicLimitL2 + '' : '',
          "dynamicLimitL3": zone.dynamicLimitL3 ? zone.dynamicLimitL3 + '' : '',
          "staticLimitL1": zone.staticLimitL1 ? zone.staticLimitL1 + '' : '',
          "staticLimitL2": zone.staticLimitL2 ? zone.staticLimitL2 + '' : '',
          "staticLimitL3": zone.staticLimitL3 ? zone.staticLimitL3 + '' : '',
          "energyPrice": zone.energyPrice ? zone.energyPrice + '' : ''
        },
      );
    }
    console.log(`Zones attributes updated !`);
  }

  async updateChargingStationAttributes(chargingStationData: IChargingStation[]) {

    for (const cs of chargingStationData) {
      const csNode = this.chargingStationIdentityToNodeRecord[cs.identity];
      if (!csNode) {
        console.log(`Charging Station ${cs.name} not found, skipping attribute update. ( This should not happen if charging stations are mapped first )`);
        continue;
      }
      SpinalGraphService._addNode(csNode);
      await attributeService.createOrUpdateAttrsAndCategories(
        csNode,
        'Charge Unix',
        {
          "identity": cs.identity ? cs.identity + '' : '',
          "vip": cs.vip ? cs.vip + '' : 'false',
          "zoneId": cs.zoneId ? cs.zoneId + '' : '',
          "operatorDisconnectedPolicy": cs.operatorDisconnectedPolicy ? cs.operatorDisconnectedPolicy + '' : '',
          "operatorHeartbeatMinimumInterval": cs.operatorHeartbeatMinimumInterval ? cs.operatorHeartbeatMinimumInterval + '' : '',
          "operatorMetervaluesMinimumInterval": cs.operatorMetervaluesMinimumInterval ? cs.operatorMetervaluesMinimumInterval + '' : '',
          "chargePointVendor": cs.chargePointVendor ? cs.chargePointVendor + '' : '',
          "chargePointModel": cs.chargePointModel ? cs.chargePointModel + '' : '',
          "chargeBoxSerialNumber": cs.chargeBoxSerialNumber ? cs.chargeBoxSerialNumber + '' : '',
          "chargePointSerialNumber": cs.chargePointSerialNumber ? cs.chargePointSerialNumber + '' : '',
          "firmwareVersion": cs.firmwareVersion ? cs.firmwareVersion + '' : '',
          "supportedFeatures": cs.supportedFeatures ? cs.supportedFeatures + '' : '',
        });
    }
    console.log(`Charging Stations attributes updated !`);
  }
  async updateEnergyCounterAttributes(energyCounterData: IEquipment[]) {
    for (const ec of energyCounterData) {
      const ecNode = this.energyCounterToNodeRecord[ec.id];
      if (!ecNode) {
        console.log(`Energy Counter ${ec.name} not found, skipping attribute update. ( This should not happen if energy counters are mapped first )`);
        continue;
      }
      SpinalGraphService._addNode(ecNode);
      await attributeService.createOrUpdateAttrsAndCategories(
        ecNode,
        'Charge Unix',
        {
          "name": ec.name ? ec.name + '' : '',
          "id": ec.id ? ec.id + '' : '',
          "productId": ec.productId ? ec.productId + '' : '',
          "zoneIds": ec.zones ? ec.zones.map(z => z.id).join(',') : ''
        });
    }
    console.log(`Energy Counters attributes updated !`);
  }

  async linkChargingStationsToZones() {
    const zoneGroups = await this.zoneCategory.getChildrenInContext(this.zoneContext);
    const chargingStations = await this.chargingStationGroup.getChildrenInContext(this.typologyContext);
    let mapZoneIdToNode: Map<number, SpinalNode<any>> = new Map();
    for (const zoneGroup of zoneGroups) {
      const attr = await attributeService.findOneAttributeInCategory(zoneGroup, 'Charge Unix', 'id');
      if (attr === -1) continue;
      const zoneId = parseInt(attr.value.get());
      mapZoneIdToNode.set(zoneId, zoneGroup);
    }

    for (const csNode of chargingStations) {
      SpinalGraphService._addNode(csNode);
      const zoneIdAttr = await attributeService.findOneAttributeInCategory(csNode, 'Charge Unix', 'zoneId');
      if (zoneIdAttr === -1) continue;
      const zoneId = parseInt(zoneIdAttr.value.get());
      if (!mapZoneIdToNode.has(zoneId)) {
        //console.log(`Zone with id ${zoneId} not found for charging station ${csNode.getName().get()}, skipping linking.`);
        continue;
      }
      await groupManagerService.linkElementToGroup(this.zoneContext.getId().get(), mapZoneIdToNode.get(zoneId).getId().get(), csNode.getId().get());
    }
    console.log(`Charging Stations linked to Zones !`);
  }



  async createEndpoint(
    deviceNode: SpinalNode<any>,
    endpointName: string,
    initialValue: number | string | boolean,
    unit = ''
  ): Promise<SpinalNode<any>> {

    const endpointNodeModel = new InputDataEndpoint(
      endpointName,
      initialValue ?? 0,
      unit,
      InputDataEndpointDataType.Real,
      InputDataEndpointType.Other
    );

    const endpointInfo = await this.nwService.createNewBmsEndpoint(deviceNode.getId().get(), endpointNodeModel);

    const realNode = SpinalGraphService.getRealNode(endpointInfo.id.get());
    // SpinalGraphService._addNode(realNode);


    await this.timeseriesService.pushFromEndpoint(
      endpointInfo.id.get(),
      initialValue as number
    );
    await attributeService.updateAttribute(
      realNode,
      'default',
      'timeSeries maxDay',
      { value: '14' }
    );
    return realNode;
  }

  // Gave up on this because counters can be linked to multiple zones
  // async linkEnergyCountersToZones(){

  // }



  /*async createDevice(device : IDevice) {
    const deviceNodeModel = new InputDataDevice(device.id);
    const res = await this.nwService.createNewBmsDevice(this.nwVirtual.getId().get(), deviceNodeModel);
    const createdNode = SpinalGraphService.getRealNode(res.id.get());
    await this.addDeviceAttributes(createdNode, device);

    console.log('Created device ', createdNode.getName().get());
  }

  async addDeviceAttributes(node: SpinalNode<any>, deviceModel: IDevice) {
     await attributeService.addAttributeByCategoryName(
      node,
      'Api_Attributes',
      'name',
      `${deviceModel.name}`
    );
    await attributeService.addAttributeByCategoryName(
      node,
      'Api_Attributes',
      'buildingId',
      `${deviceModel.buildingId}`
    );
    await attributeService.addAttributeByCategoryName(
      node,
      'Api_Attributes',
      'floorId',
      `${deviceModel.floorId}`
    );
    await attributeService.addAttributeByCategoryName(
      node,
      'Api_Attributes',
      'spaceId',
      `${deviceModel.spaceId}`
    );
    await attributeService.addAttributeByCategoryName(
      node,
      'Api_Attributes',
      'ontologyType',
      `${deviceModel.ontologyType}`
    );

  }

  async createDevices(buildingDevices){
    const deviceNodes = await this.nwVirtual.getChildren('hasBmsDevice');
    // await this.createDevice(buildingDevices[0]);
    for (const device of buildingDevices){
      let deviceNode = deviceNodes.find((node) => node.getName().get() === device.id);
      if(deviceNode){
        console.log(`Device ${device.name} already exists, skipping creation.`);
        SpinalGraphService._addNode(deviceNode);
        continue;
      }
      await this.createDevice(device);
      
    }
  }


  

  async createEndpoints(buildingMeasures: IMeasurementValue[]){
    const deviceNodes = await this.nwVirtual.getChildren('hasBmsDevice');
    console.log(`Creating endpoints for ${deviceNodes.length} devices...`);

    for (const measure of buildingMeasures) {
      const deviceNode = deviceNodes.find(node => node.getName().get() === measure.deviceId);
      if (!deviceNode) {
        // console.log(`Device ${measure.deviceId} not found, skipping measure. ( This should not happen if devices are created first )`);
        continue;
      }
      SpinalGraphService._addNode(deviceNode);

      const endpoints = await deviceNode.getChildren('hasBmsEndpoint');
      let existingEndpoint = endpoints.find((ep) => ep.getName().get() === measure.name);
      if (existingEndpoint) {
        SpinalGraphService._addNode(existingEndpoint);
        this.endpointMap.set(measure.id, existingEndpoint);
        continue;
      }
      existingEndpoint = await this.createEndpoint(deviceNode, measure.name, measure.value);
      this.endpointMap.set(measure.id, existingEndpoint)

    }
  }

  async updateEndpointValues(buildingMeasures: IMeasurementValue[]){
    console.log(`Updating values for ${buildingMeasures.length} measures...`);
    for (const measure of buildingMeasures) {
      const endpointNode = this.endpointMap.get(measure.id);
      if (!endpointNode) {
        console.log(`Endpoint for measure ${measure.id} not found, skipping update.`);
        continue;
      }
      this.nwService.setEndpointValue(endpointNode.getId().get(), measure.value);
    }

  }

  async addSpaceNameAttributeInDevices(){
    const spaces = await this.apiClient.getBuildingSpaces(this.clientBuilding.id, this.clientBuilding.spaceCount);
    const deviceNodes = await this.nwVirtual.getChildren('hasBmsDevice');
    for( const deviceNode of deviceNodes) {
      SpinalGraphService._addNode(deviceNode);

      const spaceIdAttribute = await attributeService.findOneAttributeInCategory(deviceNode, 'Api_Attributes', 'spaceId');
      if( spaceIdAttribute === -1 )  continue;
      const spaceId = spaceIdAttribute.value.get();

      const space = spaces.find(s => s.id === spaceId);
      if(!space) continue;
      console.log(`Adding space name attribute for device ${deviceNode.getName().get()} with space ${space.name}`);
      await attributeService.addAttributeByCategoryName(deviceNode, 'Api_Attributes', 'spaceName', space.name);
    }

  }*/

  async createChargingStationDevicesAndEndpoints(chargingStationData: IChargingStation[], connectorData: ICSConnector[]) {
    const existingDevices = await this.nwVirtual.getChildrenInContext(this.nwContext);
    for (const cs of chargingStationData) {
      const csIdentity = cs.identity;
      let deviceNode = existingDevices.find((node) => node.getName().get() === csIdentity);
      if (!deviceNode) {
        console.log(`Device for Charging Station ${cs.name} not found, creating...`);
        const deviceNodeModel = new InputDataDevice(csIdentity);
        deviceNode = await this.createDevice(csIdentity, 'ChargingStation');
        // create endpoints
        this.createEndpoint(deviceNode, 'connected', cs.connected);
        this.createEndpoint(deviceNode, 'lastHeartbeat', new Date(cs.lastHeartbeat).getTime());
        const csConnectors = connectorData.filter(conn => conn.chargingStationIdentity === cs.identity);
        for (const csConnector of csConnectors) {
          const endpointStatusName = `Connector_${csConnector.id}_Status`;
          const code = this.statusEnumerationMap.get(csConnector.status) ?? this.statusEnumerationMap.get('Unknown');
          this.createEndpoint(deviceNode, endpointStatusName, code);
        }
      }
    }
  }

  async createEnergyCounterDevicesAndEndpoints(energyCounterData: IEquipment[]) {
    const existingDevices = await this.nwVirtual.getChildrenInContext(this.nwContext);
    for (const ec of energyCounterData) {
      let deviceNode = existingDevices.find((node) => node.getName().get() === ec.name);
      if (!deviceNode) {
        console.log(`Device for Energy Counter ${ec.name} not found, creating...`);
        deviceNode = await this.createDevice(ec.name, 'EnergyCounter');
        // create endpoints
        this.createEndpoint(deviceNode, 'connected', ec.connected);
        // create endpoints for l1 , l2 , l3 currents and energy consumptions
        this.createEndpoint(deviceNode, 'Current_L1', ec.values.currents.l1.value, ec.values.currents.l1.unit);
        this.createEndpoint(deviceNode, 'Current_L2', ec.values.currents.l2.value, ec.values.currents.l2.unit);
        this.createEndpoint(deviceNode, 'Current_L3', ec.values.currents.l3.value, ec.values.currents.l3.unit);
        this.createEndpoint(deviceNode, 'Energy_Consumption', ec.values.energy.value, ec.values.energy.unit);
      }
    }
  }

  async linkDevicesToChargingStationsAndEnergyCounters() {
    const existingDevices = await this.nwVirtual.getChildrenInContext(this.nwContext);
    const chargingStations = await this.chargingStationGroup.getChildrenInContext(this.typologyContext);
    const energyCounters = await this.energyCounterGroup.getChildrenInContext(this.typologyContext);



    for (const deviceNode of existingDevices) {
      const deviceName = deviceNode.getName().get();
      if (this.chargingStationIdentityToNodeRecord[deviceName]) {
        const parentNode = this.chargingStationIdentityToNodeRecord[deviceName]; // Parent is the charging station BimObject
        const existingChildren = await parentNode.getChildren('hasBmsDevice');
        const alreadyLinked = existingChildren.find((child) => child.getId().get() === deviceNode.getId().get());
        if (!alreadyLinked) {
          parentNode.addChild(deviceNode, 'hasBmsDevice', SPINAL_RELATION_PTR_LST_TYPE);
        }
      }
      else {
        const parentNode = this.energyCounterToNodeRecord[deviceName]; // Parent is the energy counter BimObject
        if (!parentNode) continue;
        const existingChildren = await parentNode.getChildren('hasBmsDevice');
        const alreadyLinked = existingChildren.find((child) => child.getId().get() === deviceNode.getId().get());
        if (alreadyLinked) continue;
        parentNode.addChild(deviceNode, 'hasBmsDevice', SPINAL_RELATION_PTR_LST_TYPE);
      }
    }

  }

  async createDevice(deviceName: string, type: string) {
    const deviceNodeModel = new InputDataDevice(deviceName, type);
    const res = await this.nwService.createNewBmsDevice(this.nwVirtual.getId().get(), deviceNodeModel);
    const createdNode = SpinalGraphService.getRealNode(res.id.get());
    console.log('Created device ', createdNode.getName().get());
    return createdNode;
  }

  async updateChargingStationDevices(chargingStationData: IChargingStation[], connectorData: ICSConnector[]) {
    const existingDevices = await this.nwVirtual.getChildrenInContext(this.nwContext);
    for (const cs of existingDevices) {
      const matchingCs = chargingStationData.find((apiCs) => {
        return apiCs.identity === cs.getName().get();
      });
      if (!matchingCs) {
        continue;
      }
      const endpoints = await cs.getChildren('hasBmsEndpoint');
      const connectedEndpoint = endpoints.find((ep) => ep.getName().get() === 'connected');
      if (connectedEndpoint) {
        await this.updateEndpoint(connectedEndpoint, matchingCs.connected);
      }
      const lastHeartbeatEndpoint = endpoints.find((ep) => ep.getName().get() === 'lastHeartbeat');
      if (lastHeartbeatEndpoint) {
        await this.updateEndpoint(lastHeartbeatEndpoint, new Date(matchingCs.lastHeartbeat).getTime());
      }
      // We get the connectors for this charging station
      const csConnectors = connectorData.filter(conn => conn.chargingStationIdentity === matchingCs.identity);
      for (const csConnector of csConnectors) {
        const endpointStatusName = `Connector_${csConnector.id}_Status`;
        const statusEndpoint = endpoints.find((ep) => ep.getName().get() === endpointStatusName);
        if (statusEndpoint) {
          const code = this.statusEnumerationMap.get(csConnector.status) ?? this.statusEnumerationMap.get('Unknown');
          await this.updateEndpoint(statusEndpoint, code);
        }
      }
    }
  }

  async updateEnergyCounterDevices(energyCounterData: IEquipment[]) {
    const existingDevices = await this.nwVirtual.getChildrenInContext(this.nwContext);
    for (const ec of existingDevices) {
      const matchingEc = energyCounterData.find((apiEc) => {
        return apiEc.name === ec.getName().get();
      });
      if (!matchingEc) {
        continue;
      }

      const endpoints = await ec.getChildren('hasBmsEndpoint');
      const connectedEndpoint = endpoints.find((ep) => ep.getName().get() === 'connected');
      if (connectedEndpoint) {
        await this.updateEndpoint(connectedEndpoint, matchingEc.connected);
      }
      // update endpoints for l1 , l2 , l3 currents and energy consumptions
      const currentL1Endpoint = endpoints.find((ep) => ep.getName().get() === 'Current_L1');
      if (currentL1Endpoint) {
        await this.updateEndpoint(currentL1Endpoint, matchingEc.values.currents.l1.value);
      }
      const currentL2Endpoint = endpoints.find((ep) => ep.getName().get() === 'Current_L2');
      if (currentL2Endpoint) {
        await this.updateEndpoint(currentL2Endpoint, matchingEc.values.currents.l2.value);
      }
      const currentL3Endpoint = endpoints.find((ep) => ep.getName().get() === 'Current_L3');
      if (currentL3Endpoint) {
        await this.updateEndpoint(currentL3Endpoint, matchingEc.values.currents.l3.value);
      }
      const energyConsumptionEndpoint = endpoints.find((ep) => ep.getName().get() === 'Energy_Consumption');
      if (energyConsumptionEndpoint) {
        await this.updateEndpoint(energyConsumptionEndpoint, matchingEc.values.energy.value);
      }

    }
  }


  async updateEndpoint(endpointNode: SpinalNode<any>, newValue: number | string | boolean) {
    SpinalGraphService._addNode(endpointNode);
    await this.nwService.setEndpointValue(endpointNode.getId().get(), newValue);
    console.log(`Updated endpoint ${endpointNode.getName().get()} with value ${newValue}`);
  }


  async createAndUpdateTransactions(transactionData: ITransaction[]) {
    const pendingTransactionsNodes = await this.pendingTransactionStep.getChildrenInContext(this.transactionContext);
    const terminatedTransactionNodes = await this.terminatedTransactionStep.getChildrenInContext(this.transactionContext);
    const chargingStationNodes = await this.chargingStationGroup.getChildrenInContext(this.typologyContext);
    const chargingStationIdentityToNodeRecord: Record<string, SpinalNode<any>> = {};
    for (const csNode of chargingStationNodes) {
      const csIdentityAttr = await attributeService.findOneAttributeInCategory(csNode, 'Charge Unix', 'identity');
      if (csIdentityAttr === -1) continue;
      const csIdentity = csIdentityAttr.value.get();
      chargingStationIdentityToNodeRecord[csIdentity] = csNode;
    }


    for (const tx of transactionData) {
      if (!chargingStationIdentityToNodeRecord[tx.chargingStationIdentity]) { //if we dont have the charging station BimObject
        console.log(`Charging Station with identity ${tx.chargingStationIdentity} not found, cannot create transaction ticket.`);
        continue;
      }

      let foundTransactionNode;
      if (!tx.terminatedAt) { // Pending transaction
        foundTransactionNode = pendingTransactionsNodes.find((node) => node.getName().get() === `${tx.transactionId}`);
      }

      if (!foundTransactionNode && tx.terminatedAt) { //Terminated transaction
        foundTransactionNode = terminatedTransactionNodes.find((node) => node.getName().get() === `${tx.transactionId}`);
      }

      if (!foundTransactionNode) { // Create transaction node if not found (ticket)

        const ticketInfo = {
          name: `${tx.transactionId}`,
          tagId: tx.tagId,
          chargeUnixId: tx.id,
          chargingStationIdentity: tx.chargingStationIdentity,
          connectorId: tx.connectorId,
          meterStart: tx.meterStart,
          meterValue: tx.meterValue,
          amount: tx.amount,
          startedAt: tx.createdAt,
          terminatedAt: tx.terminatedAt || '',
          reason: tx.reason || ''
        }
        const ticketNode = await addTicket(ticketInfo, this.transactionProcess, this.transactionContext, chargingStationIdentityToNodeRecord[tx.chargingStationIdentity]);
        if (tx.terminatedAt) {
          await moveTicketToStep(ticketNode, this.pendingTransactionStep, this.terminatedTransactionStep, this.transactionContext);
        }
      }
      else {
        // Update existing transaction node attributes
        attributeService.createOrUpdateAttrsAndCategories(
          foundTransactionNode,
          'default',
          {
            "meterValue": `${tx.meterValue}`,
            "amount": `${tx.amount}`,
            "terminatedAt": tx.terminatedAt || '',
            "reason": tx.reason || ''
          }
        )
      }



    }

  }



  async init(): Promise<void> {
    console.log('Initiating SyncRunPull');
    try {

      await this.nwService.init(this.graph, { contextName: process.env.NETWORK_NAME, contextType: "Network", networkName: process.env.VIRTUAL_NETWORK_NAME, networkType: "NetworkVirtual" });
      await this.initRequiredNodes();

      const zoneData = await this.apiClient.getZoneData();
      console.log(`Fetched ${zoneData.length} zones from API`);
      const chargingStationData = await this.apiClient.getChargingStationData();
      console.log(`Fetched ${chargingStationData.length} charging stations from API`);
      const energyCounterData = await this.apiClient.getEquipmentData();
      console.log(`Fetched ${energyCounterData.length} energy counters from API`);

      await this.createZonesIfNotExist(zoneData);
      await this.updateZoneAttributes(zoneData);
      await this.updateChargingStationAttributes(chargingStationData);
      await this.updateEnergyCounterAttributes(energyCounterData);
      await this.linkChargingStationsToZones();

      const connectorData = await this.apiClient.getConnectorData();
      console.log(`Fetched ${connectorData.length} connectors from API`);

      await this.createChargingStationDevicesAndEndpoints(chargingStationData, connectorData)
      await this.createEnergyCounterDevicesAndEndpoints(energyCounterData);
      // 5 Link those devices to charging stations and energy counters nodes in typology
      await this.linkDevicesToChargingStationsAndEnergyCounters();


      const transactionData = await this.apiClient.getTransactionData();
      console.log(`Fetched ${transactionData.length} transactions from API`);
      await this.createAndUpdateTransactions(transactionData);



      console.log('Required nodes initialized');

      this.config.lastSync.set(Date.now());
      console.log('Init DONE !');

    } catch (e) {
      console.error(e);
    }
  }

  async run(): Promise<void> {
    console.log('Starting run...');
    this.running = true;
    const timeout = parseInt(process.env.PULL_INTERVAL);
    await this.waitFct(timeout);
    while (true) {
      if (!this.running) break;
      const before = Date.now();
      try {
        console.log('Run...');
        const chargingStationData = await this.apiClient.getChargingStationData();
        console.log(`Fetched ${chargingStationData.length} charging stations from API`);
        const connectorData = await this.apiClient.getConnectorData();
        console.log(`Fetched ${connectorData.length} connectors from API`);
        await this.updateChargingStationDevices(chargingStationData, connectorData);
        console.log('Charging Stations updated !');
        const energyCounterData = await this.apiClient.getEquipmentData();
        console.log(`Fetched ${energyCounterData.length} energy counters from API`);
        await this.updateEnergyCounterDevices(energyCounterData);
        console.log('Energy Counters updated !');

        const transactionData = await this.apiClient.getTransactionData();
        console.log(`Fetched ${transactionData.length} transactions from API`);
        await this.createAndUpdateTransactions(transactionData);


        console.log('... Run finished !');
        this.config.lastSync.set(Date.now());
      } catch (e) {
        console.error(e);
        await this.waitFct(1000 * 60);
      } finally {
        const delta = Date.now() - before;
        const timeout = parseInt(process.env.PULL_INTERVAL) - delta;
        await this.waitFct(timeout);
      }
    }
  }

  stop(): void {
    this.running = false;
  }
}
export default SyncRunPullApi;
