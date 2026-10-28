import type { NextRequest } from "next/server";
import { z } from "zod";
import { deleteCustomDish, getDishById, setDishDisabled, updateDish, writeAudit } from "@/server/repository";
import { handleRouteError, jsonOk } from "@/server/http";
import { assertCsrf, enforceWriteRateLimit } from "@/server/security";
import { ApiError } from "@/server/errors";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  role: z.enum(["meat", "veg", "soup", "other"]).optional(),
  protein: z.enum(["pork", "beef", "chicken", "duck", "lamb", "rabbit", "fish", "shrimp", "frog", "squid", "crab", "crayfish", "egg", "other", "none"]).optional(),
  spiceLevel: z.number().int().min(0).max(2).optional(),
  flavor: z.enum(["light", "normal", "rich"]).optional(),
  autoPlannable: z.boolean().optional(),
  enabled: z.boolean().optional()
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    await enforceWriteRateLimit(request);
    const { id } = await params;
    const parsed = patchSchema.parse(await request.json());
    const dish = await getDishById(id);
    if (!dish) throw new ApiError({ status: 404, code: "DISH_NOT_FOUND", message: "没有找到这道菜。" });
    if (parsed.enabled !== undefined) await setDishDisabled(id, !parsed.enabled);
    const propertyPatch = { ...parsed };
    delete propertyPatch.enabled;
    if (Object.keys(propertyPatch).length > 0) {
      if (!dish.isCustom) {
        throw new ApiError({
          status: 403,
          code: "BUILTIN_DISH_READ_ONLY",
          message: "内置菜只能停用或校正食材，不能修改菜名和分类。",
          action: "edit_recipe"
        });
      }
      const nextRole = propertyPatch.role ?? dish.role;
      const nextProtein = propertyPatch.protein ?? dish.protein;
      if (nextRole === "meat" && (nextProtein === "none" || nextProtein === "other")) {
        throw new ApiError({ status: 400, code: "MEAT_PROTEIN_REQUIRED", message: "荤菜需要选择明确的主蛋白质。" });
      }
      if ((nextRole === "veg" || nextRole === "other") && nextProtein !== "none") {
        throw new ApiError({ status: 400, code: "INVALID_DISH_PROTEIN", message: "素菜和非推荐池菜品的主蛋白质应为无。" });
      }
      await updateDish(id, {
        ...propertyPatch,
        spiceLevel: propertyPatch.spiceLevel as 0 | 1 | 2 | undefined
      });
    }
    await writeAudit("dish.update", id, { enabled: parsed.enabled });
    return jsonOk({ dish: await getDishById(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    await enforceWriteRateLimit(request);
    const { id } = await params;
    await deleteCustomDish(id);
    await writeAudit("dish.delete", id);
    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("内置菜")) {
      return handleRouteError(new ApiError({ status: 403, code: "BUILTIN_DISH_READ_ONLY", message: error.message }));
    }
    return handleRouteError(error);
  }
}
