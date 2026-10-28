import { getIngredients } from "@/server/repository";
import { handleRouteError, jsonOk } from "@/server/http";

export async function GET() {
  try {
    return jsonOk({ ingredients: await getIngredients() });
  } catch (error) {
    return handleRouteError(error);
  }
}
