export class AiServiceError extends Error {
  code: string;
  action: string;
  retryable: boolean;
  status: number;
  rawOutput?: string;

  constructor(input: {
    code: string;
    message: string;
    action?: string;
    retryable?: boolean;
    status?: number;
    rawOutput?: string;
  }) {
    super(input.message);
    this.code = input.code;
    this.action = input.action ?? "use_local";
    this.retryable = input.retryable ?? true;
    this.status = input.status ?? 502;
    this.rawOutput = input.rawOutput;
  }
}
