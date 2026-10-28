import type { NextRequest } from "next/server";
import { z } from "zod";
import { backupSchema, BACKUP_SCHEMA_VERSION, importBackup } from "@/server/backup";
import { writeAudit } from "@/server/repository";
import { handleRouteError, jsonOk } from "@/server/http";
import { assertCsrf, enforceWriteRateLimit } from "@/server/security";
import { ApiError } from "@/server/errors";

const bodySchema = z.object({ backup: backupSchema, confirm: z.literal(true) });

export async function POST(request: NextRequest) {
  try {
    assertCsrf(request);
    await enforceWriteRateLimit(request);
    const parsed = bodySchema.parse(await request.json());
    if (parsed.backup.schemaVersion > BACKUP_SCHEMA_VERSION) {
      throw new ApiError({
        status: 400,
        code: "BACKUP_VERSION_UNSUPPORTED",
        message: "备份版本高于当前应用支持的版本，无法导入。",
        action: "upgrade_app"
      });
    }
    try {
      await importBackup(parsed.backup);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("备份")) {
        throw new ApiError({ status: 400, code: "BACKUP_INVALID", message: error.message });
      }
      throw error;
    }
    await writeAudit("backup.import", "family", { planCount: parsed.backup.plans.length });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
