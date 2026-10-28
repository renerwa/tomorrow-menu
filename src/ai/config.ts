export interface AiConfig {
  configured: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxDailyCalls: number;
  maxCallsPerIpPerDay: number;
}

export function getAiConfig(): AiConfig {
  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const apiKey = process.env.AI_API_KEY?.trim() || "";
  const model = process.env.AI_MODEL?.trim() || "";
  return {
    configured: Boolean(apiKey && model),
    baseUrl,
    apiKey,
    model,
    timeoutMs: Math.max(1000, Number(process.env.AI_TIMEOUT_MS || 30_000)),
    maxDailyCalls: Math.max(1, Number(process.env.AI_MAX_DAILY_CALLS || 30)),
    maxCallsPerIpPerDay: Math.max(1, Number(process.env.AI_MAX_CALLS_PER_IP_PER_DAY || 10))
  };
}

export function aiStatus() {
  const config = getAiConfig();
  return {
    configured: config.configured,
    model: config.configured ? config.model : null,
    timeoutMs: config.timeoutMs,
    maxDailyCalls: config.maxDailyCalls,
    maxCallsPerIpPerDay: config.maxCallsPerIpPerDay
  };
}
