import { z } from "zod";

export const aiMenuSchema = z.object({
  dishes: z
    .array(
      z.object({
        dishId: z.string().min(1),
        reason: z.string().min(1).max(240)
      })
    )
    .min(3)
    .max(4),
  summary: z.string().min(1).max(500),
  diversity: z
    .object({
      protein: z.string().max(240).default(""),
      vegetable: z.string().max(240).default(""),
      flavor: z.string().max(240).default("")
    })
    .optional()
    .default({ protein: "", vegetable: "", flavor: "" }),
  confidence: z.number().min(0).max(1).nullable().optional().default(null)
});

export type AiMenuOutput = z.infer<typeof aiMenuSchema>;

export const aiRecipeSchema = z.object({
  suggestions: z
    .array(
      z.object({
        dishId: z.string().min(1),
        ingredients: z
          .array(
            z.object({
              name: z.string().min(1).max(40),
              category: z.enum(["meat", "vegetable", "soy", "seasoning", "staple", "other"]),
              defaultPantry: z.boolean().default(false)
            })
          )
          .max(20)
      })
    )
    .max(20)
});

export type AiRecipeOutput = z.infer<typeof aiRecipeSchema>;

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // Continue with brace extraction below.
      }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("AI response did not contain valid JSON");
  }
}
