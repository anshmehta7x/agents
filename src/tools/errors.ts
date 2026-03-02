export class ToolNotFoundError extends Error {
  constructor(toolName: string) {
    super(`Tool not found: "${toolName}"`);
    this.name = "ToolNotFoundError";
  }
}

export class ToolInputValidationError extends Error {
  public readonly validationDetails: string;

  constructor(toolName: string, details: string) {
    super(`Invalid input for tool "${toolName}": ${details}`);
    this.name = "ToolInputValidationError";
    this.validationDetails = details;
  }
}

export class ToolExecutionError extends Error {
  public readonly toolName: string;
  public readonly cause: unknown;

  constructor(toolName: string, cause: unknown) {
    const message =
      cause instanceof Error ? cause.message : String(cause);
    super(`Execution failed for tool "${toolName}": ${message}`);
    this.name = "ToolExecutionError";
    this.toolName = toolName;
    this.cause = cause;
  }
}

export class ToolTimeoutError extends Error {
  public readonly toolName: string;
  public readonly timeoutMs: number;

  constructor(toolName: string, timeoutMs: number) {
    super(`Tool "${toolName}" timed out after ${timeoutMs}ms`);
    this.name = "ToolTimeoutError";
    this.toolName = toolName;
    this.timeoutMs = timeoutMs;
  }
}
