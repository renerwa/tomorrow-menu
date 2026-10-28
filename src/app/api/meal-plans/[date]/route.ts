import type { NextRequest } from "next/server";
import { isPastDate, todayInTimeZone } from "@/domain/date";
import { deletePlan, getFamily, getMealPlanByDate } from "@/server/repository";
import { getPlanResponse } from "@/server/planner";
import { handleRouteError, jsonOk, requireDate } from "@/server/http";
import { assertCsrf, enforceWriteRateLimit } from "@/server/security";
import { ApiError } from "@/server/errors";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  try {
    const date = requireDate((await params).date);
    return jsonOk(await getPlanResponse(date));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  try {
    assertCsrf(request);
    await enforceWriteRateLimit(request);
    const date = requireDate((await params).date);
    const [family, plan] = await Promise.all([getFamily(), getMealPlanByDate(date)]);
    if (!plan) throw new ApiError({ status: 404, code: "PLAN_NOT_FOUND", message: "这天还没有菜单。" });
    if (isPastDate(date, todayInTimeZone(family.timezone))) {
      throw new ApiError({ status: 403, code: "PAST_DATE_READ_ONLY", message: "过去日期只读，不能删除。" });
    }
    await deletePlan(date);
    return jsonOk({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
