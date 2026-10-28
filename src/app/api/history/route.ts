import type { NextRequest } from "next/server";
import { getComposition } from "@/domain/composition";
import { getHistory } from "@/server/repository";
import { handleRouteError, jsonOk } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const limitParam = Number(request.nextUrl.searchParams.get("limit") || 60);
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitParam) ? limitParam : 60));
    const rows = await getHistory(limit);
    return jsonOk({
      plans: rows.map(({ plan, dishes }) => ({
        id: plan.id,
        targetDate: plan.targetDate,
        status: plan.status,
        source: plan.source,
        manualOverride: plan.manualOverride,
        historyWindowUsed: plan.historyWindowUsed,
        updatedAt: plan.updatedAt,
        dishes,
        composition: getComposition(dishes)
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
