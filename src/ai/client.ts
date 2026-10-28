import { getAiConfig } from "./config";
import { AiServiceError } from "./errors";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatResult {
  content: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

export async function callChatCompletions(messages: ChatMessage[]): Promise<ChatResult> {
  const config = getAiConfig();
  if (!config.configured) {
    throw new AiServiceError({
      code: "AI_NOT_CONFIGURED",
      message: "AI 未配置，正在使用本地规则推荐。",
      action: "configure_server",
      retryable: false,
      status: 503
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.45,
        response_format: { type: "json_object" }
      }),
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new AiServiceError({
          code: "AI_UNAUTHORIZED",
          message: "AI 密钥无效或已过期，已切换到本地推荐。",
          action: "check_server_key",
          retryable: false,
          status: 401
        });
      }
      if (response.status === 429) {
        throw new AiServiceError({
          code: "AI_RATE_LIMITED",
          message: "AI 服务暂时限流，已切换到本地推荐。",
          action: "retry_later",
          status: 429
        });
      }
      throw new AiServiceError({
        code: "AI_UPSTREAM_ERROR",
        message: `AI 服务返回异常（${response.status}），已切换到本地推荐。`,
        action: "retry",
        status: 502
      });
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new AiServiceError({
        code: "AI_EMPTY_RESPONSE",
        message: "AI 没有返回可用内容，已切换到本地推荐。",
        action: "retry",
        status: 502
      });
    }
    return {
      content,
      inputTokens: payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.completion_tokens ?? null,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    if (error instanceof AiServiceError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiServiceError({
        code: "AI_TIMEOUT",
        message: "AI 响应超时，已切换到本地推荐。",
        action: "retry",
        status: 504
      });
    }
    throw new AiServiceError({
      code: "AI_NETWORK_ERROR",
      message: "无法连接 AI 服务，已切换到本地推荐。",
      action: "retry",
      status: 502
    });
  } finally {
    clearTimeout(timer);
  }
}
