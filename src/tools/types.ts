export type JsonSchema = {
  type: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  items?: JsonSchema;
  enum?: unknown[];
  default?: unknown;
  additionalProperties?: boolean;
  [key: string]: unknown;
};

export interface ToolMetadata {
  requiresAuth?: boolean;
  timeout?: number;
  source?: "local" | "mcp" | "plugin";
  version?: string;
  [key: string]: unknown;
}

export interface ToolResult {
  success: boolean;
  output: unknown;
  error?: string;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  metadata?: ToolMetadata;
  execute(input: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export function createTool(config: {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  metadata?: ToolMetadata;
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
}): Tool {
  return {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    metadata: config.metadata ?? { source: "local" },
    execute: config.execute,
  };
}
