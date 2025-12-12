import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import fs from 'fs';
import path from 'path';
import { IZone } from '../../interfaces/api/IZone';
import { IChargingStation } from '../../interfaces/api/IChargingStation';
import { IEquipment } from '../../interfaces/api/IEquipment';
import { IEquipmentValuesResponse } from '../../interfaces/api/IEquipment';
import { ICSConnector } from '../../interfaces/api/ICSConnector';

export class ClientApi {
  private static instance: ClientApi;
  private apiAxios: AxiosInstance;


  private constructor() {
    if (!process.env.API_BASE_URL) throw new Error('Missing API_BASE_URL environment variable');
    if (!process.env.API_TOKEN) throw new Error('Missing API_TOKEN environment variable');

    const baseURL = `${process.env.API_BASE_URL}/api/`;

    this.apiAxios = axios.create({ baseURL });

    // Attach Authorization only to API calls
    this.apiAxios.interceptors.request.use((cfg) => {
      cfg.headers = cfg.headers ?? {};
      if (process.env.API_TOKEN) {
        cfg.headers['Authorization'] = `Bearer ${process.env.API_TOKEN}`;
      }
      return cfg;
    });
  }

  public static getInstance(): ClientApi {
    if (!ClientApi.instance) ClientApi.instance = new ClientApi();
    return ClientApi.instance;
  }


  // ---- API methods ----

  async getZoneData() {
    return (await this.apiAxios.get<IZone[]>('/zone/data')).data;
  }

  async getChargingStationData() {
    return (await this.apiAxios.get<IChargingStation[]>('/charging-station/data')).data;
  }

  async getEquipmentData() {
    return (await this.apiAxios.post<IEquipment[]>('/equipment/data', { with : ['zones','values']})).data;
  }
 
  async getEquipmentValues(equipmentId: number) {
    return (await this.apiAxios.get<IEquipmentValuesResponse>(`/equipment/${equipmentId}/values`)).data;
  }

  async getConnectorData() {
    return (await this.apiAxios.get<ICSConnector[]>('/connector/data')).data;
  }



}
