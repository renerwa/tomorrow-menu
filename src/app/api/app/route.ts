import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { addDays, todayInTimeZone } from "@/domain/date";
import { aiStatus, getAiConfig } from "@/ai/config";
import { countRateLimit, getDishCounts, getFamily, getSettings } from "@/server/repository";
import { handleRouteError } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const [family, settings, counts] = await Promise.all([getFamily(), getSettings(), getDishCounts()]);
    const today = todayInTimeZone(family.timezone);
    const config = getAiConfig();
    const callsToday = config.configured ? await countRateLimit(today, "ai-generate") : 0;
    const token = request.cookies.get("mm_csrf")?.value || randomUUID();
    const response = NextResponse.json(
      {
        family: {
          name: family.name,
          timezone: family.timezone,
          profile: family.profile,
          createdAt: family.createdAt
        },
        settings,
        counts,
        today,
        tomorrow: addDays(today, 1),
        ai: {
          ...aiStatus(),
          callsToday,
          remaining: Math.max(0, config.maxDailyCalls - callsToday)
        },
        csrfToken: token,
        appVersion: "1.0.0",
        accessMode: "single-family-no-login"
      },
      { headers: { "Cache-Control": "no-store" } }
    );
    response.cookies.set("mm_csrf", token, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
