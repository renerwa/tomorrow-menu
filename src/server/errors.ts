export class ApiError extends Error {
  status: number;
  code: string;
  action?: string;
  details?: unknown;

  constructor(input: { status: number; code: string; message: string; action?: string; details?: unknown }) {
    super(input.message);
    this.status = input.status;
    this.code = input.code;
    this.action = input.action;
    this.details = input.details;
  }
}

export function errorBody(error: ApiError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.action ? { action: error.action } : {}),
      ...(error.details ? { details: error.details } : {})
    }
  };
}
