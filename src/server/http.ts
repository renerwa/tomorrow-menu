import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError, errorBody } from "./errors";
import { AiServiceError } from "@/ai/errors";
import { isValidDateString } from "@/domain/date";

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export function jsonError(error: ApiError): NextResponse {
  return NextResponse.json(errorBody(error), {
    status: error.status,
    headers: { "Cache-Control": "no-store" }
  });
}

export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof ApiError) return jsonError(error);
  if (error instanceof AiServiceError) {
    return jsonError(
      new ApiError({
        status: error.status,
        code: error.code,
        message: error.message,
        action: error.action
      })
    );
  }
  if (error instanceof ZodError) {
    return jsonError(
      new ApiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: error.issues[0]?.message || "请求参数不正确。",
        action: "fix_input",
        details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
      })
    );
  }
  console.error("[api] unhandled error", error instanceof Error ? error.message : "unknown");
  return jsonError(
    new ApiError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "服务暂时出了点问题，请稍后重试。",
      action: "retry"
    })
  );
}

export function requireDate(value: string): string {
  if (!isValidDateString(value)) {
    throw new ApiError({ status: 400, code: "INVALID_DATE", message: "日期格式应为 YYYY-MM-DD。" });
  }
  return value;
}
