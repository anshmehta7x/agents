export enum Role {
  SYSTEM = "system",
  USER = "user",
  ASSISTANT = "assistant",
  TOOL = "tool"
}

export interface Message {
  content: string
  role: Role
}

export interface ModelRequest {
  messages: Message[]
  temperature?: number
  maxTokens?: number
}

export interface TokenUsage {
  inputTokens?: number
  outputTokens?: number
}

export interface ModelResponse {
  content: string | null,
  usage: TokenUsage | null
}

export interface StreamChunk {
  content?: string
  usage?: TokenUsage
}
