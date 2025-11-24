import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import fs from 'fs';
import path from 'path';
import { IMeasurementValue } from '../../interfaces/api/IMeasurementValue';
import { IBuilding } from '../../interfaces/api/IBuilding';
import { IDevice } from '../../interfaces/api/IDevice';
import { IFloor } from '../../interfaces/api/IFloor';
import { ISpace } from '../../interfaces/api/ISpace';

interface TokenData {
  accessToken: string;
  expireAt: number; // ms epoch
}

export class ClientApi {
  private static instance: ClientApi;

  // One axios for your API, another for auth
  private apiAxios: AxiosInstance;
  private authAxios: AxiosInstance;

  private tokenPath: string;

  private accessToken?: string;
  private expireAt?: number;

  // single-flight locks
  private ensurePromise?: Promise<void>;
  private refreshPromise?: Promise<void>;

  private static readonly SKEW_MS = 90_000; // refresh 90s early

  private constructor() {
    if (!process.env.API_BASE_URL) throw new Error('Missing API_BASE_URL environment variable');
    if (!process.env.TENANT_ID) throw new Error('Missing TENANT_ID environment variable');
    if (!process.env.CLIENT_ID) throw new Error('Missing CLIENT_ID environment variable');
    if (!process.env.CLIENT_SECRET) throw new Error('Missing CLIENT_SECRET environment variable');
    if (!process.env.SCOPE) throw new Error('Missing SCOPE environment variable');
    if (!process.env.GRANT_TYPE) throw new Error('Missing GRANT_TYPE environment variable');

    const baseURL = `${process.env.API_BASE_URL}/api/`;

    this.apiAxios = axios.create({ baseURL });
    this.authAxios = axios.create(); // no baseURL, no auth header interceptor

    this.tokenPath = path.resolve(process.cwd(), 'access_token.json');
    this.loadTokenFromFile();

    // Attach Authorization only to API calls
    this.apiAxios.interceptors.request.use((cfg) => {
      cfg.headers = cfg.headers ?? {};
      if (this.accessToken) {
        cfg.headers['Authorization'] = `Bearer ${this.accessToken}`;
      }
      return cfg;
    });
  }

  public static getInstance(): ClientApi {
    if (!ClientApi.instance) ClientApi.instance = new ClientApi();
    return ClientApi.instance;
  }

  private loadTokenFromFile() {
    if (!fs.existsSync(this.tokenPath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8')) as TokenData;
      this.accessToken = data.accessToken;
      this.expireAt = data.expireAt;
      console.log('Token loaded from file');
    } catch (e) {
      console.error('Error reading token file:', e);
    }
  }

  private saveTokenToFile() {
    if (!this.accessToken || !this.expireAt) return;
    const data: TokenData = {
      accessToken: this.accessToken,
      expireAt: this.expireAt,
    };
    try {
      const tmp = `${this.tokenPath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data), { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tmp, this.tokenPath);
    } catch (e) {
      console.error('Error writing token file:', e);
    }
  }

  private async generateToken(): Promise<void> {
    console.log('Generating new token ...');

    const tenantId = process.env.TENANT_ID!;
    const loginURL = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    // Azure AD v2 expects x-www-form-urlencoded
    const form = new URLSearchParams();
    form.set('client_id', process.env.CLIENT_ID!);
    form.set('client_secret', process.env.CLIENT_SECRET!);
    form.set('grant_type', process.env.GRANT_TYPE!); // usually "client_credentials"
    form.set('scope', process.env.SCOPE!);

    const cfg: AxiosRequestConfig = {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    };

    const r = await this.authAxios.post(loginURL, form.toString(), cfg);

    // Map Azure response fields to our internal shape
    this.accessToken = r.data.access_token;
    this.expireAt = Date.now() + (r.data.expires_in ?? 3600) * 1000;

    this.saveTokenToFile();
    console.log('Generating token ... Done!');
  }

  private isExpiringSoon(): boolean {
    if (!this.expireAt) return true;
    return Date.now() + ClientApi.SKEW_MS >= this.expireAt;
  }

  private async ensureTokenValid(): Promise<void> {
    if (!this.ensurePromise) {
      this.ensurePromise = (async () => {
        if (!this.accessToken) {
          await this.generateToken();
        } else if (this.isExpiringSoon()) {
          if (!this.refreshPromise) {
            this.refreshPromise = this.generateToken().finally(() => {
              this.refreshPromise = undefined;
            });
          }
          await this.refreshPromise;
        }
      })().finally(() => {
        this.ensurePromise = undefined;
      });
    }
    await this.ensurePromise;
  }

  private async getWithRetry<T>(url: string): Promise<T> {
    await this.ensureTokenValid();
    try {
      const r = await this.apiAxios.get<T>(url);
      return r.data;
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 401) {
        await this.generateToken();
        const r2 = await this.apiAxios.get<T>(url);
        return r2.data;
      }
      const body = e?.response?.data;
      throw new Error(`GET ${url} failed: ${status ?? 'no-status'} ${JSON.stringify(body ?? {})}`);
    }
  }

  // ---- API methods ----

  /**
   * Get buildings for a specific organization.
   * @returns A promise that resolves to an array of buildings
   */
  async getBuildings() {
    return this.getWithRetry<IBuilding[]>('/Buildings?includeCounts=true');
  }

  /**
   * Get measurement values for a specific building.
   * @param buildingId The ID of the building
   * @returns A promise that resolves to an array of measurement values
   */
  async getBuildingMeasurementValues(buildingId: string, take: number = 1000) {
    return this.getWithRetry<IMeasurementValue[]>(`/Buildings/${buildingId}/MeasurementValues?take=${take}`);
  }

  /**
   * Get floors for a specific building.
   * @param buildingId The ID of the building
   * @returns A promise that resolves to an array of floors
   */
  async getBuildingFloors(buildingId: string,) {
    return this.getWithRetry<IFloor[]>(`/Buildings/${buildingId}/Floors`);
  }

  /**
   * Get devices for a specific building. As of now, only Occupancy_Sensor_Equipment are fetched.
   * @param buildingId The ID of the building
   * @returns A promise that resolves to an array of devices
   */
  async getBuildingDevices(buildingId:string, take: number = 1000) {
    return this.getWithRetry<IDevice[]>(`/Buildings/${buildingId}/Devices?ontologyType=Occupancy_Sensor_Equipment&take=${take}`);
  }

  async getBuildingSpaces(buildingId:string, take: number = 1000) {
    return this.getWithRetry<ISpace[]>(`/Buildings/${buildingId}/Spaces?take=${take}`);
  }



}
