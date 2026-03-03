export type EventType =
  | "run_start"
  | "run_end"
  | "iteration"
  | "tool_call"
  | "log";

export type LogLevel = "info" | "debug" | "warn" | "error";

export type RunStartPayload = {
  sessionId: string;
  agentName: string;
  userQuery: string;
};

export type RunEndPayload = {
  status: "success" | "error" | "max_iters";
  totalInputTokens: number;
  totalOutputTokens: number;
  iterationCount: number;
  durationMs: number;
  finalAnswer?: string;
  errorMessage?: string;
};

export type IterationPayload = {
  iteration: number;
  thought: string;
  action: "continue" | "tool" | "final";
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  hadFormatRetry: boolean;
};

export type ToolCallPayload = {
  iteration: number;
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  success: boolean;
  durationMs: number;
  errorMessage?: string;
};

export type LogPayload = {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
};

export type EventPayload =
  | RunStartPayload
  | RunEndPayload
  | IterationPayload
  | ToolCallPayload
  | LogPayload;

export interface ObservabilityEvent {
  type: EventType;
  runId: string;
  payload: EventPayload;
}
