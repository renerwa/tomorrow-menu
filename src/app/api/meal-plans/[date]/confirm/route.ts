import type { NextRequest } from "next/server";
import { z } from "zod";
import { getFamily } from "@/server/repository";
import { confirmPlan, getMealPlanByDate, writeAudit } from "@/server/repository";
import { assertPlanDateEditable, getConfirmationIssues, getPlanResponse } from "@/server/planner";
import { handleRouteError, jsonOk, requireDate } from "@/server/http";
import { assertCsrf, enforceWriteRateLimit } from "@/server/security";
import { ApiError } from "@/server/errors";

const bodySchema = z.object({ manualOverride: z.boolean().default(false) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  try {
    assertCsrf(request);
    await enforceWriteRateLimit(request);
    const date = requireDate((await params).date);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const family = await getFamily();
    assertPlanDateEditable(date, family.timezone);
    const plan = await getMealPlanByDate(date);
    if (!plan) throw new ApiError({ status: 404, code: "PLAN_NOT_FOUND", message: "这天还没有菜单。" });
    const { issues, planExists } = await getConfirmationIssues(date);
    if (!planExists) throw new ApiError({ status: 404, code: "PLAN_NOT_FOUND", message: "这天还没有菜单。" });
    if (issues.length > 0 && !body.manualOverride) {
      throw new ApiError({
        status: 409,
        code: "COMPOSITION_OVERRIDE_REQUIRED",
        message: "这桌不符合家庭晚餐规则，确认前需要再次确认。",
        action: "manual_override",
        details: { issues }
      });
    }
    await confirmPlan(date, issues.length > 0);
    await writeAudit("plan.confirm", date, { manualOverride: issues.length > 0 });
    return jsonOk(await getPlanResponse(date));
  } catch (error) {
    return handleRouteError(error);
  }
}
