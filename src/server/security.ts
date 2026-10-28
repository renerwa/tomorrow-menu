import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { ApiError } from "./errors";
import { todayInTimeZone } from "@/domain/date";
import { countRateLimit, recordRateLimit } from "./repository";

export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return;
  try {
    if (new URL(origin).host !== host) {
      throw new ApiError({ status: 403, code: "CSRF_ORIGIN_MISMATCH", message: "请求来源校验失败。" });
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError({ status: 403, code: "CSRF_ORIGIN_MISMATCH", message: "请求来源校验失败。" });
  }
}

export function assertCsrf(request: NextRequest): void {
  assertSameOrigin(request);
  const cookie = request.cookies.get("mm_csrf")?.value;
  const header = request.headers.get("x-csrf-token");
  if (!cookie || !header || cookie !== header) {
    throw new ApiError({
      status: 403,
      code: "CSRF_TOKEN_INVALID",
      message: "安全令牌失效，请刷新页面后重试。",
      action: "reload"
    });
  }
}

export function requestIpHash(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "local";
  const salt = process.env.IP_HASH_SALT || process.env.FAMILY_ID || "mingri-menu";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

function positiveLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export async function enforceWriteRateLimit(request: NextRequest): Promise<void> {
  const day = todayInTimeZone(process.env.FAMILY_TIMEZONE || "Asia/Shanghai");
  const ipHash = requestIpHash(request);
  const maxDaily = positiveLimit(process.env.WRITE_MAX_DAILY_CALLS, 500);
  const maxPerIp = positiveLimit(process.env.WRITE_MAX_CALLS_PER_IP_PER_DAY, 200);
  const [globalCalls, ipCalls] = await Promise.all([
    countRateLimit(day, "write"),
    countRateLimit(day, "write", ipHash)
  ]);
  if (globalCalls >= maxDaily || ipCalls >= maxPerIp) {
    throw new ApiError({
      status: 429,
      code: "WRITE_RATE_LIMITED",
      message: "今天的修改次数已达上限，请明天再试。",
      action: "retry_later"
    });
  }
  await recordRateLimit(day, "write", ipHash);
}
