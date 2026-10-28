import type { NextRequest } from "next/server";
import { generatePlan } from "@/server/planner";
import { handleRouteError, jsonOk, requireDate } from "@/server/http";
import { assertCsrf, enforceWriteRateLimit } from "@/server/security";

export async function POST(request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  try {
    assertCsrf(request);
    await enforceWriteRateLimit(request);
    const date = requireDate((await params).date);
    return jsonOk(await generatePlan(date, request));
  } catch (error) {
    return handleRouteError(error);
  }
}
