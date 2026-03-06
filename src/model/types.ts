export enum Role {
  SYSTEM = "system",
  USER = "user",
  ASSISTANT = "assistant",
  TOOL = "tool",
}

export enum GenerationType {
  GENERATE,
  STREAM,
}

export interface Message {
  role: Role;
  content: string;
}

export interface ModelRequest {
  model?: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
}

export interface ModelResponse {
  content: string | null;
  model?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}
