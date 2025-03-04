/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import axios from "axios";

export class SensorHumedadServices {
  private API_URL: string;

  constructor() {
    this.API_URL = `${process.env.NEXT_PUBLIC_API_URL}/sensor-humedad` || "";
  }

  async findAllByDate(date: string): Promise<
    [
      {
        id: number;
        value: number;
        createdAt: Date | string;
        updatedAt: Date | string;
      }
    ]
  > {
    try {
      console.log(this.API_URL);
      const res = await axios.get(`${this.API_URL}/data/${date}`);
      return res.data;
    } catch (error: any) {
      throw new Error("Error fetching data by date");
    }
  }

  async getValveState(): Promise<{ state: boolean }> {
    try {
      const res = await axios.get(`${this.API_URL}/valve/state`);
      return res.data;
    } catch (error: any) {
      throw new Error("Error fetching valve state");
    }
  }

  async setValveOn(): Promise<[number]> {
    try {
      const res = await axios.get(`${this.API_URL}/valve/on`);
      return res.data;
    } catch (error: any) {
      throw new Error("Error turning valve on");
    }
  }

  async setValveOff(): Promise<[number]> {
    try {
      const res = await axios.get(`${this.API_URL}/valve/off`);
      return res.data;
    } catch (error: any) {
      throw new Error("Error turning valve off");
    }
  }

  async getAlarmState(): Promise<{ id: number; state: boolean }> {
    try {
      const res = await axios.get(`${this.API_URL}/alarm`);
      return res.data;
    } catch (error: any) {
      throw new Error("Error fetching alarm state");
    }
  }

  async setAlarmOn(): Promise<[number]> {
    try {
      const res = await axios.get(`${this.API_URL}/alarm/on`);
      return res.data;
    } catch (error: any) {
      throw new Error("Error turning alarm on");
    }
  }

  async setAlarmOff(): Promise<[number]> {
    try {
      const res = await axios.get(`${this.API_URL}/alarm/off`);
      return res.data;
    } catch (error: any) {
      throw new Error("Error turning alarm off");
    }
  }
}
