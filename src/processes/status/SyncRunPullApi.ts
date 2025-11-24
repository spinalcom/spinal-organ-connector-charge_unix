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

import { IDevice } from '../../interfaces/api/IDevice';
import { IBuilding } from '../../interfaces/api/IBuilding';
import { IMeasurementValue } from '../../interfaces/api/IMeasurementValue';


import { SpinalServiceTimeseries } from 'spinal-model-timeseries';

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
  nwService: NetworkService;
  nwContext: SpinalNode<any>;
  nwVirtual: SpinalNode<any>;
  clientBuilding : IBuilding;
  endpointMap: Map<string, SpinalNode<any>> = new Map();
  timeseriesService: SpinalServiceTimeseries;


  constructor(graph: SpinalGraph<any>, config: OrganConfigModel) {
    this.graph = graph;
    this.config = config;
    this.running = false;
    this.nwService = new NetworkService(true);
    this.apiClient = ClientApi.getInstance();
    this.timeseriesService = new SpinalServiceTimeseries();
  }

  async getSpatialContext(): Promise<SpinalNode<any>> {
    const contexts = await this.graph.getChildren();
    for (const context of contexts) {
      if (context.info.name.get() === 'spatial') {
        // @ts-ignore
        SpinalGraphService._addNode(context);
        return context;
      }
    }
    throw new Error('Spatial Context Not found');
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

  async getNetworkContext(): Promise<SpinalNode<any>> {
    const contexts = await this.graph.getChildren();
    for (const context of contexts) {
      if (context.info.name.get() === process.env.NETWORK_NAME) {
        // @ts-ignore
        SpinalGraphService._addNode(context);
        return context;
      }
    }
    throw new Error('Network Context Not found');
  }

  async getVirtualNetwork(): Promise<SpinalNode<any>> {
    const virtual = await this.nwContext.findOneInContext(this.nwContext, (node) => {
      return node.getName().get() === process.env.VIRTUAL_NETWORK_NAME;
    });
    if (!virtual) throw new Error('Virtual Network Context Not found');
    SpinalGraphService._addNode(virtual);
    return virtual;
  }

  async createDevice(device : IDevice) {
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


  async createEndpoint(
    deviceNode: SpinalNode<any>,
    endpointName: string,
    initialValue: number | string | boolean
  ) : Promise<SpinalNode<any>> {
    
    const endpointNodeModel = new InputDataEndpoint(
      endpointName,
      initialValue ?? 0,  
      '',
      InputDataEndpointDataType.Real,
      InputDataEndpointType.Other
    );

    const endpointInfo = await this.nwService.createNewBmsEndpoint(deviceNode.getId().get(), endpointNodeModel);

    const realNode =  SpinalGraphService.getRealNode(endpointInfo.id.get());
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

  }

  async init(): Promise<void> {
    console.log('Initiating SyncRunPull');
    try {

      await this.nwService.init(this.graph, {contextName : process.env.NETWORK_NAME, contextType :"Network", networkName:process.env.VIRTUAL_NETWORK_NAME, networkType:"NetworkVirtual"});
      this.nwContext = await this.getNetworkContext();
      this.nwVirtual = await this.getVirtualNetwork();
      console.log('Network Service initialized');

      const buildings = await this.apiClient.getBuildings();
      this.clientBuilding = buildings.find(b => b.name === 'ASTRID');
      if (!this.clientBuilding) throw new Error('Building ASTRID not found in API response. Perhaps database has changed?');
      console.log('Fetching building data...')

      // await this.addSpaceNameAttributeInDevices();
      let [buildingDevices, buildingMeasures] = await Promise.all([
        this.apiClient.getBuildingDevices(this.clientBuilding.id,this.clientBuilding.deviceCount), // Will only get Occupancy_Sensor_Equipment devices
        this.apiClient.getBuildingMeasurementValues(this.clientBuilding.id,this.clientBuilding.measurementCount) // Will get all measurement values ( including temperature stuff, but will get filtered out)
      ])
      buildingMeasures = buildingMeasures.filter(m => ['Occupancy_Status','Occupancy_Count_Sensor'].includes(m.ontologyType));
      console.log(`Done ! Found ${buildingDevices.length} devices and ${buildingMeasures.length} measures.`);
      await this.createDevices(buildingDevices);
      await this.createEndpoints(buildingMeasures);



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
        const buildingMeasures = await this.apiClient.getBuildingMeasurementValues(this.clientBuilding.id,this.clientBuilding.measurementCount);
        const filteredMeasures = buildingMeasures.filter(m => ['Occupancy_Status','Occupancy_Count_Sensor'].includes(m.ontologyType));
        await this.updateEndpointValues(filteredMeasures);
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
