import type { DishCountSummary, FamilyProfile, Settings } from "@/domain/types";

export interface AppInfo {
  family: {
    name: string;
    timezone: string;
    profile: FamilyProfile;
    createdAt: string;
  };
  settings: Settings;
  counts: DishCountSummary;
  today: string;
  tomorrow: string;
  ai: {
    configured: boolean;
    model: string | null;
    timeoutMs: number;
    maxDailyCalls: number;
    maxCallsPerIpPerDay: number;
    callsToday: number;
    remaining: number;
  };
  csrfToken: string;
  appVersion: string;
  accessMode: string;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    action?: string;
    details?: unknown;
  };
}

export class ClientApiError extends Error {
  code: string;
  status: number;
  action?: string;
  details?: unknown;

  constructor(input: { status: number; code: string; message: string; action?: string; details?: unknown }) {
    super(input.message);
    this.status = input.status;
    this.code = input.code;
    this.action = input.action;
    this.details = input.details;
  }
}
