export interface AppError {
  code: string;
  message: string;
  statusCode: number;
}

export const errors = {
  INVALID_TOKEN: {
    code: 'INVALID_TOKEN',
    message: 'Invalid or expired token',
    statusCode: 401,
  },
  MISSING_TOKEN: {
    code: 'MISSING_TOKEN',
    message: 'Authorization token required',
    statusCode: 401,
  },
  AGENT_NOT_FOUND: {
    code: 'AGENT_NOT_FOUND',
    message: 'Agent not found',
    statusCode: 404,
  },
  AGENT_EXISTS: {
    code: 'AGENT_EXISTS',
    message: 'Agent with this name already exists',
    statusCode: 409,
  },
  TASK_NOT_FOUND: {
    code: 'TASK_NOT_FOUND',
    message: 'Task not found',
    statusCode: 404,
  },
  INVALID_STATUS_TRANSITION: {
    code: 'INVALID_STATUS_TRANSITION',
    message: 'Invalid task status transition',
    statusCode: 400,
  },
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    message: 'Unauthorized access',
    statusCode: 403,
  },
  INVALID_REQUEST: {
    code: 'INVALID_REQUEST',
    message: 'Invalid request',
    statusCode: 400,
  },
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    statusCode: 500,
  },
} as const;

export function createError(error: AppError, customMessage?: string): AppError {
  return {
    ...error,
    message: customMessage || error.message,
  };
}
